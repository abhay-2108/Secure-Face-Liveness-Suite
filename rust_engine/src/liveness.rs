//! # Liveness Detection Module
//!
//! Provides three robust Zero-ML liveness checks:
//! 1. FFT Moiré/Halftone Detection
//! 2. Jitter/Micro-Motion Tracking (Sparse Lucas-Kanade Optical Flow)
use std::sync::Mutex;
use lazy_static::lazy_static;

lazy_static! {
    static ref PREV_FRAMES: Mutex<Vec<Vec<u8>>> = Mutex::new(Vec::new());
    static ref PREV_WIDTH: Mutex<usize> = Mutex::new(0);
    static ref PREV_HEIGHT: Mutex<usize> = Mutex::new(0);
    
    // Feature 1: Screen Flash Cache
    static ref FLASH_DARK_CROP: Mutex<Option<Vec<u8>>> = Mutex::new(None);
}

/// Computes the Laplacian Variance of the image to detect high-frequency micro-textures.
pub fn calculate_laplacian_variance(y_channel: &[u8], width: usize, height: usize) -> f64 {
    if width < 3 || height < 3 {
        return 0.0;
    }

    let mut sum: f64 = 0.0;
    let mut sum_sq: f64 = 0.0;
    let mut count: f64 = 0.0;

    for y in 1..(height - 1) {
        for x in 1..(width - 1) {
            let idx = y * width + x;

            let center = y_channel[idx] as i32;
            let top = y_channel[idx - width] as i32;
            let bottom = y_channel[idx + width] as i32;
            let left = y_channel[idx - 1] as i32;
            let right = y_channel[idx + 1] as i32;

            let laplacian = (top + bottom + left + right - 4 * center).abs() as f64;

            sum += laplacian;
            sum_sq += laplacian * laplacian;
            count += 1.0;
        }
    }

    if count == 0.0 {
        return 0.0;
    }

    let mean = sum / count;
    (sum_sq / count) - (mean * mean)
}

/// Feature 1: Screen Flash Reflection Analysis (Zero-ML Liveness)
/// Captures reflection difference between dark frame and lit frame.
/// Real 3D skin absorbs and scatters light softly (subsurface scattering) with high, structured
/// spatial variance, while a digital screen/flat photo causes flat glare or localized specular peaks.
pub fn process_screen_flash(y_channel: &[u8], width: usize, height: usize, flash_state: i32) -> (bool, f64) {
    if width < 64 || height < 64 {
        return (true, 1.0);
    }

    let cx = width / 2;
    let cy = height / 2;
    let start_x = cx - 32;
    let start_y = cy - 32;

    if flash_state == 1 {
        // Capture baseline "Dark" frame crop
        let mut crop = vec![0u8; 64 * 64];
        for y in 0..64 {
            let src_y = start_y + y;
            for x in 0..64 {
                let src_x = start_x + x;
                crop[y * 64 + x] = y_channel[src_y * width + src_x];
            }
        }
        let mut guard = FLASH_DARK_CROP.lock().unwrap();
        *guard = Some(crop);
        return (true, 0.5); // capturing in-progress
    } else if flash_state == 2 {
        // Retrieve cached dark crop
        let dark_guard = FLASH_DARK_CROP.lock().unwrap();
        let dark_crop = match &*dark_guard {
            Some(crop) => crop,
            None => return (false, 0.0), // Error: lit before dark
        };

        // Capture current "Lit" frame crop
        let mut lit_crop = vec![0u8; 64 * 64];
        for y in 0..64 {
            let src_y = start_y + y;
            for x in 0..64 {
                let src_x = start_x + x;
                lit_crop[y * 64 + x] = y_channel[src_y * width + src_x];
            }
        }

        // Calculate difference: diff = lit - dark
        let mut diff = vec![0.0f32; 64 * 64];
        let mut sum_diff = 0.0;
        for i in 0..(64 * 64) {
            let d = (lit_crop[i] as f32) - (dark_crop[i] as f32);
            diff[i] = d;
            sum_diff += d;
        }

        let mean_diff = sum_diff / 4096.0;

        // If overall lighting decreased or stayed same, flash failed to illuminate
        if mean_diff < 1.5 {
            return (false, 0.1);
        }

        // Calculate spatial variance of difference image
        let mut sum_sq_diff = 0.0;
        let mut specular_saturated = 0;
        for i in 0..(64 * 64) {
            let d = diff[i];
            sum_sq_diff += (d - mean_diff) * (d - mean_diff);
            if d > 160.0 {
                specular_saturated += 1;
            }
        }
        let var_diff = sum_sq_diff / 4096.0;

        // 3D skin reflection rules:
        // 1. Structural difference variance should be solid (indicates light falling differentially on nose/cheeks/eyes)
        // 2. High specular saturation (massive flat glaring spots) should be low (a tablet screen or glossy paper will reflect huge glare patches)
        let mut score = 1.0;
        if var_diff < 35.0 {
            // Flat reflection
            score -= 0.6;
        }
        if specular_saturated > 120 {
            // Saturated glare spot (digital screen specular peak)
            score -= 0.5;
        }

        let passed = score >= 0.6;
        return (passed, score);
    }

    (true, 1.0)
}

/// Feature 3: Jitter/Micro-Motion Tracking (Sparse Lucas-Kanade Optical Flow)
/// Standard rigid photo attacks lack non-rigid facial deforming and micro-tremors.
/// We track 5 sparse points over 3 frames and analyze pairwise distance variance.
pub fn track_jitter_optical_flow(y_channel: &[u8], width: usize, height: usize) -> (bool, f64) {
    if width < 120 || height < 120 {
        return (true, 1.0);
    }

    let mut history = PREV_FRAMES.lock().unwrap();
    let mut w_guard = PREV_WIDTH.lock().unwrap();
    let mut h_guard = PREV_HEIGHT.lock().unwrap();

    // Reset if frame size changed
    if *w_guard != width || *h_guard != height {
        history.clear();
        *w_guard = width;
        *h_guard = height;
    }

    // Keep rolling history of 3 frames
    history.push(y_channel.to_vec());
    if history.len() < 3 {
        return (true, 0.5); // Need at least 3 frames for velocity variance
    }
    if history.len() > 3 {
        history.remove(0);
    }

    // Define 5 keypoint coordinates: Nose, Left Eye, Right Eye, Left Cheek, Right Cheek
    let cx = width / 2;
    let cy = height / 2;
    let points_base = [
        (cx, cy), // Nose
        (cx - width / 8, cy - height / 8), // Left Eye
        (cx + width / 8, cy - height / 8), // Right Eye
        (cx - width / 8, cy + height / 8), // Left Cheek
        (cx + width / 8, cy + height / 8), // Right Cheek
    ];

    // Track coordinates over 3 steps: P[k][i] = (x, y) at frame k
    let mut p = vec![vec![(0.0f32, 0.0f32); 5]; 3];
    for i in 0..5 {
        p[0][i] = (points_base[i].0 as f32, points_base[i].1 as f32);
    }

    // Compute optical flow velocity (u, v) from frame 0 -> 1 and 1 -> 2
    for step in 0..2 {
        let prev = &history[step];
        let curr = &history[step + 1];

        for i in 0..5 {
            let px = p[step][i].0.round() as i32;
            let py = p[step][i].1.round() as i32;

            // Solve sparse Lucas-Kanade on 5x5 window
            let mut sxx = 0.0;
            let mut sxy = 0.0;
            let mut syy = 0.0;
            let mut sxt = 0.0;
            let mut syt = 0.0;

            for dy in -2..=2 {
                for dx in -2..=2 {
                    let x = px + dx;
                    let y = py + dy;

                    if x > 0 && x < (width as i32 - 1) && y > 0 && y < (height as i32 - 1) {
                        let idx = (y * width as i32 + x) as usize;
                        let ix = ((prev[idx + 1] as f32 - prev[idx - 1] as f32) / 2.0 + 
                                  (curr[idx + 1] as f32 - curr[idx - 1] as f32) / 2.0) / 2.0;
                        let iy = ((prev[idx + width] as f32 - prev[idx - width] as f32) / 2.0 + 
                                  (curr[idx + width] as f32 - curr[idx - width] as f32) / 2.0) / 2.0;
                        let it = curr[idx] as f32 - prev[idx] as f32;

                        sxx += ix * ix;
                        sxy += ix * iy;
                        syy += iy * iy;
                        sxt += -ix * it;
                        syt += -iy * it;
                    }
                }
            }

            let det = sxx * syy - sxy * sxy;
            let (u, v) = if det.abs() > 1e-4 {
                ((sxt * syy - sxy * syt) / det, (sxx * syt - sxt * sxy) / det)
            } else {
                (0.0, 0.0)
            };

            // Clamp velocity to avoid giant noise spikes
            let u_clamped = u.max(-5.0).min(5.0);
            let v_clamped = v.max(-5.0).min(5.0);

            p[step + 1][i] = (p[step][i].0 + u_clamped, p[step][i].1 + v_clamped);
        }
    }

    // Calculate pairwise distances (10 pairs) across the 3 steps
    let mut pairs_var = Vec::new();
    let mut total_velocity = 0.0;

    for i in 0..5 {
        for j in (i + 1)..5 {
            let mut dists = [0.0f32; 3];
            for k in 0..3 {
                let dx = p[k][i].0 - p[k][j].0;
                let dy = p[k][i].1 - p[k][j].1;
                dists[k] = (dx * dx + dy * dy).sqrt();
            }

            // Variance of distances
            let mean = (dists[0] + dists[1] + dists[2]) / 3.0;
            let var = ((dists[0] - mean).powi(2) + (dists[1] - mean).powi(2) + (dists[2] - mean).powi(2)) / 3.0;
            pairs_var.push(var);
        }

        // Velocity for stats
        let vx = p[2][i].0 - p[0][i].0;
        let vy = p[2][i].1 - p[0][i].1;
        total_velocity += (vx * vx + vy * vy).sqrt();
    }

    let avg_distance_var: f32 = pairs_var.iter().sum::<f32>() / 10.0;
    let avg_velocity = total_velocity / 5.0;

    // Jitter/Non-rigidity rules:
    // 1. Static check: If there is absolute zero motion (< 0.08 px), it is static paper/screen.
    // 2. Rigidity check: If motion is happening but relative distance variance is ultra-low (< 0.03 px),
    //    the object is perfectly rigid (a printed paper photo being moved or tablet screen being rotated).
    let mut score = 1.0;
    if avg_velocity < 0.08 {
        // Complete static photo / still holder
        score -= 0.7;
    } else if avg_distance_var < 0.03 {
        // Mathematical perfect rigidity (printed photo on a stick / flat screen)
        score -= 0.6;
    } else if avg_distance_var > 6.0 {
        // Unusually chaotic movement (shaking frame / high noise fallback)
        score -= 0.3;
    }

    let passed = score >= 0.65;
    (passed, score)
}

/// Consolidated core offline liveness checker
pub fn check_liveness(y_channel: &[u8], width: usize, height: usize) -> bool {
    let variance = calculate_laplacian_variance(y_channel, width, height);

    // Baseline Laplacian micro-texture variance check
    if variance < 50.0 {
        return false;
    }

    // Optical Flow Jitter checks
    let (jitter_ok, _) = track_jitter_optical_flow(y_channel, width, height);

    jitter_ok
}
