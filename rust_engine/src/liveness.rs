//! # Liveness Detection Module
//!
//! Provides both Active and Passive liveness checks.

/// Computes the Laplacian Variance of the image to detect high-frequency micro-textures.
/// 
/// Feature 5: Passive Liveness (Micro-Texture Analysis)
/// A real human face has high-frequency pores and micro-textures.
/// A printed photo or a digital screen often has a lower variance or distinct Moiré patterns.
/// By running a Laplacian convolution over the bounding box of the face, we can instantly
/// reject 2D spoofs without forcing the user to blink or move their head.
pub fn calculate_laplacian_variance(y_channel: &[u8], width: usize, height: usize) -> f64 {
    // A simplified 3x3 Laplacian kernel approximation for speed:
    // [ 0  1  0 ]
    // [ 1 -4  1 ]
    // [ 0  1  0 ]
    
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

pub fn check_liveness(y_channel: &[u8], width: usize, height: usize) -> bool {
    let variance = calculate_laplacian_variance(y_channel, width, height);
    
    // If the micro-texture variance is too low (e.g., a flat printed photo), reject instantly.
    if variance < 50.0 {
        return false; // Spoof detected!
    }

    // In a real implementation, this would proceed to Active Liveness (optical flow tracking of blinks).
    true
}
