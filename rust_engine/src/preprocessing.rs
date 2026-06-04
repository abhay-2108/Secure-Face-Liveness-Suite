//! # Preprocessing Module
//!
//! Provides Contrast Limited Adaptive Histogram Equalization (CLAHE) for handling
//! harsh sunlight and uneven illumination in rural environments.

pub struct Clahe {
    pub clip_limit: f32,
    pub grid_size: (usize, usize),
}

impl Clahe {
    pub fn new(clip_limit: f32, grid_w: usize, grid_h: usize) -> Self {
        Self {
            clip_limit,
            grid_size: (grid_w, grid_h),
        }
    }

    /// Applies scalar CLAHE in-place to the Y channel.
    ///
    /// ARM NEON acceleration is a planned optimization, not part of this
    /// implementation.
    pub fn apply_in_place(&self, buffer: &mut [u8], width: usize, height: usize) {
        if buffer.len() < width * height {
            return;
        }

        let (tiles_x, tiles_y) = self.grid_size;
        let tile_w = width / tiles_x;
        let tile_h = height / tiles_y;

        if tile_w == 0 || tile_h == 0 {
            return;
        }

        let tile_area = tile_w * tile_h;
        let clip_limit = (self.clip_limit * tile_area as f32).max(1.0) as usize;

        let mut histograms = vec![vec![0usize; 256]; tiles_x * tiles_y];

        for ty in 0..tiles_y {
            for tx in 0..tiles_x {
                let hist = &mut histograms[ty * tiles_x + tx];
                let start_y = ty * tile_h;
                let start_x = tx * tile_w;
                let end_y = start_y + tile_h;
                let end_x = start_x + tile_w;

                for y in start_y..end_y {
                    let row_offset = y * width;
                    for x in start_x..end_x {
                        let val = buffer[row_offset + x];
                        hist[val as usize] += 1;
                    }
                }

                let mut clipped = 0;
                for h in hist.iter_mut() {
                    if *h > clip_limit {
                        clipped += *h - clip_limit;
                        *h = clip_limit;
                    }
                }

                let redist = clipped / 256;
                let mut residual = clipped % 256;

                for h in hist.iter_mut() {
                    *h += redist;
                    if residual > 0 {
                        *h += 1;
                        residual -= 1;
                    }
                }

                let mut cdf = 0;
                let scale = 255.0 / tile_area as f32;
                for h in hist.iter_mut() {
                    cdf += *h;
                    *h = (cdf as f32 * scale).round().min(255.0) as usize;
                }
            }
        }

        let mut temp_buffer = vec![0u8; width * height];

        for y in 0..height {
            let ty1 = (y / tile_h).min(tiles_y - 1);
            let ty2 = (ty1 + 1).min(tiles_y - 1);

            let y1_center = ty1 * tile_h + tile_h / 2;
            let dy = y.saturating_sub(y1_center);
            let wy = (dy as f32 / tile_h as f32).min(1.0);

            let row_offset = y * width;
            for x in 0..width {
                let tx1 = (x / tile_w).min(tiles_x - 1);
                let tx2 = (tx1 + 1).min(tiles_x - 1);

                let x1_center = tx1 * tile_w + tile_w / 2;
                let dx = x.saturating_sub(x1_center);
                let wx = (dx as f32 / tile_w as f32).min(1.0);

                let val = buffer[row_offset + x] as usize;

                let cdf11 = histograms[ty1 * tiles_x + tx1][val] as f32;
                let cdf12 = histograms[ty1 * tiles_x + tx2][val] as f32;
                let cdf21 = histograms[ty2 * tiles_x + tx1][val] as f32;
                let cdf22 = histograms[ty2 * tiles_x + tx2][val] as f32;

                let top = cdf11 * (1.0 - wx) + cdf12 * wx;
                let bottom = cdf21 * (1.0 - wx) + cdf22 * wx;
                let interpolated = top * (1.0 - wy) + bottom * wy;

                temp_buffer[row_offset + x] = interpolated as u8;
            }
        }

        buffer.copy_from_slice(&temp_buffer);
    }
}
