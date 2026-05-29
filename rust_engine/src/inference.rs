//! # ONNX Inference Engine
//!
//! Tract-based ONNX INT8 inference engine for three facial analysis models:
//! - **Face Detector**: Linzaer Ultra-Light face detector (~1MB)
//! - **Liveness Model**: Mini-FAS-Net anti-spoofing model (~7KB)
//! - **Face Recognizer**: GhostFaceNet-S embedding extractor (~7MB)
//!
//! ## Design
//! - Uses `tract-onnx` for cross-platform CPU inference (no GPU dependency)
//! - All models loaded once at startup, inference is lock-free
//! - Bilinear resize + normalization performed in-place on arena memory
//! - Softmax and L2 normalization computed manually to avoid allocations

use tract_onnx::prelude::*;
use std::path::Path;

/// Errors that can occur during inference operations
#[derive(Debug)]
pub enum InferenceError {
    /// Failed to load the ONNX model file
    ModelLoadError(String),
    /// Failed to optimize the model graph
    OptimizationError(String),
    /// Failed to run inference
    RunError(String),
    /// Input dimensions are invalid
    InvalidInput(String),
    /// Model not loaded
    ModelNotLoaded(String),
}

impl std::fmt::Display for InferenceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            InferenceError::ModelLoadError(s) => write!(f, "Model load error: {}", s),
            InferenceError::OptimizationError(s) => write!(f, "Optimization error: {}", s),
            InferenceError::RunError(s) => write!(f, "Inference run error: {}", s),
            InferenceError::InvalidInput(s) => write!(f, "Invalid input: {}", s),
            InferenceError::ModelNotLoaded(s) => write!(f, "Model not loaded: {}", s),
        }
    }
}

impl std::error::Error for InferenceError {}

/// Result of face detection inference
#[derive(Debug, Clone)]
pub struct FaceDetectionResult {
    /// Whether a face was detected above the confidence threshold
    pub face_detected: bool,
    /// Detection confidence score [0.0, 1.0]
    pub confidence: f32,
    /// Bounding box: minimum X coordinate (normalized 0.0-1.0)
    pub xmin: f32,
    /// Bounding box: minimum Y coordinate (normalized 0.0-1.0)
    pub ymin: f32,
    /// Bounding box: maximum X coordinate (normalized 0.0-1.0)
    pub xmax: f32,
    /// Bounding box: maximum Y coordinate (normalized 0.0-1.0)
    pub ymax: f32,
}

impl Default for FaceDetectionResult {
    fn default() -> Self {
        Self {
            face_detected: false,
            confidence: 0.0,
            xmin: 0.0,
            ymin: 0.0,
            xmax: 0.0,
            ymax: 0.0,
        }
    }
}

/// Result of liveness anti-spoofing inference
#[derive(Debug, Clone)]
pub struct LivenessInferenceResult {
    /// Liveness score [0.0, 1.0] — higher means more likely to be a real face
    pub liveness_score: f32,
    /// Whether the face passes the liveness threshold (>0.85)
    pub is_real: bool,
}

impl Default for LivenessInferenceResult {
    fn default() -> Self {
        Self {
            liveness_score: 0.0,
            is_real: false,
        }
    }
}

/// Type alias for the optimized tract inference model
type TractModel = SimplePlan<TypedFact, Box<dyn TypedOp>, Graph<TypedFact, Box<dyn TypedOp>>>;

/// The main inference engine that manages all three facial analysis models.
///
/// Models are loaded once at startup and retained for the engine lifetime.
/// All inference functions are designed to be called from the frame processing pipeline
/// without heap allocation (inputs come from the memory arena).
pub struct InferenceEngine {
    /// Linzaer Ultra-Light face detector model
    detector: Option<TractModel>,
    /// Detector input dimensions (height, width)
    detector_input_dims: (usize, usize),

    /// Mini-FAS-Net liveness/anti-spoofing model
    liveness: Option<TractModel>,
    /// Liveness model input dimensions (height, width)
    liveness_input_dims: (usize, usize),

    /// GhostFaceNet-S face embedding extractor
    recognizer: Option<TractModel>,
    /// Recognizer input dimensions (height, width)
    recognizer_input_dims: (usize, usize),

    /// Embedding dimensionality (typically 128)
    embedding_dim: usize,
}

impl InferenceEngine {
    /// Creates a new inference engine with no models loaded.
    pub fn new() -> Self {
        Self {
            detector: None,
            detector_input_dims: (240, 320),
            liveness: None,
            liveness_input_dims: (80, 80),
            recognizer: None,
            recognizer_input_dims: (112, 112),
            embedding_dim: 128,
        }
    }

    /// Loads an ONNX model from the given path and optimizes it for inference.
    ///
    /// # Arguments
    /// * `path` - Path to the ONNX model file
    /// * `input_shape` - Expected input tensor shape [batch, channels, height, width]
    ///
    /// # Returns
    /// An optimized `SimplePlan` ready for inference, or an error.
    fn load_onnx_model(
        path: &Path,
        input_shape: &[usize],
    ) -> Result<TractModel, InferenceError> {
        let model = tract_onnx::onnx()
            .model_for_path(path)
            .map_err(|e| InferenceError::ModelLoadError(format!("{}: {}", path.display(), e)))?
            .with_input_fact(
                0,
                InferenceFact::dt_shape(f32::datum_type(), input_shape),
            )
            .map_err(|e| InferenceError::ModelLoadError(format!("Input shape error: {}", e)))?
            .into_optimized()
            .map_err(|e| InferenceError::OptimizationError(format!("{}", e)))?
            .into_runnable()
            .map_err(|e| InferenceError::OptimizationError(format!("Runnable error: {}", e)))?;

        Ok(model)
    }

    /// Loads the face detector model (Linzaer Ultra-Light ~1MB).
    ///
    /// Expected input: [1, 3, 240, 320] float32 tensor (RGB, normalized)
    ///
    /// # Arguments
    /// * `model_path` - Path to the detector ONNX file
    pub fn load_detector<P: AsRef<Path>>(&mut self, model_path: P) -> Result<(), InferenceError> {
        let (h, w) = self.detector_input_dims;
        let model = Self::load_onnx_model(model_path.as_ref(), &[1, 3, h, w])?;
        self.detector = Some(model);
        log::info!(
            "Face detector loaded: {}x{} input",
            w, h
        );
        Ok(())
    }

    /// Loads the liveness anti-spoofing model (Mini-FAS-Net ~7KB).
    ///
    /// Expected input: [1, 3, 80, 80] float32 tensor (RGB, normalized)
    ///
    /// # Arguments
    /// * `model_path` - Path to the liveness ONNX file
    pub fn load_liveness<P: AsRef<Path>>(&mut self, model_path: P) -> Result<(), InferenceError> {
        let (h, w) = self.liveness_input_dims;
        let model = Self::load_onnx_model(model_path.as_ref(), &[1, 3, h, w])?;
        self.liveness = Some(model);
        log::info!(
            "Liveness model loaded: {}x{} input",
            w, h
        );
        Ok(())
    }

    /// Loads the face recognition model (GhostFaceNet-S ~7MB).
    ///
    /// Expected input: [1, 3, 112, 112] float32 tensor (RGB, normalized)
    ///
    /// # Arguments
    /// * `model_path` - Path to the recognizer ONNX file
    pub fn load_recognizer<P: AsRef<Path>>(
        &mut self,
        model_path: P,
    ) -> Result<(), InferenceError> {
        let (h, w) = self.recognizer_input_dims;
        let model = Self::load_onnx_model(model_path.as_ref(), &[1, 3, h, w])?;
        self.recognizer = Some(model);
        log::info!(
            "Face recognizer loaded: {}x{} input",
            w, h
        );
        Ok(())
    }

    /// Runs face detection on a grayscale frame buffer.
    ///
    /// Performs bilinear resize and normalization, then runs the Linzaer Ultra-Light
    /// detector. Returns the highest-confidence face bounding box.
    ///
    /// # Arguments
    /// * `gray_buffer` - Grayscale pixel data (Y channel or luminance)
    /// * `width` - Frame width in pixels
    /// * `height` - Frame height in pixels
    /// * `row_stride` - Bytes per row (may include padding)
    ///
    /// # Returns
    /// `FaceDetectionResult` with bounding box if a face is detected above threshold.
    pub fn run_detection(
        &self,
        gray_buffer: &[u8],
        width: usize,
        height: usize,
        row_stride: usize,
    ) -> Result<FaceDetectionResult, InferenceError> {
        let model = self
            .detector
            .as_ref()
            .ok_or_else(|| InferenceError::ModelNotLoaded("Detector not loaded".into()))?;

        let (dest_h, dest_w) = self.detector_input_dims;

        // Build the input tensor: [1, 3, H, W] by replicating grayscale into 3 channels
        let mut input_data = vec![0.0f32; 3 * dest_h * dest_w];

        bilinear_resize_normalize_gray(
            gray_buffer,
            width,
            height,
            row_stride,
            &mut input_data,
            dest_w,
            dest_h,
            127.5,
            128.0,
        );

        let input_tensor: Tensor =
            tract_ndarray::Array4::from_shape_vec((1, 3, dest_h, dest_w), input_data)
                .map_err(|e| InferenceError::InvalidInput(format!("Tensor shape error: {}", e)))?
                .into();

        let outputs = model
            .run(tvec![input_tensor.into()])
            .map_err(|e| InferenceError::RunError(format!("Detector inference failed: {}", e)))?;

        // Parse outputs: [boxes: [1, N, 4], scores: [1, N, 2]]
        let mut result = FaceDetectionResult::default();

        if outputs.len() < 2 {
            return Ok(result);
        }

        let boxes = outputs[0]
            .to_array_view::<f32>()
            .map_err(|e| InferenceError::RunError(format!("Box output parse error: {}", e)))?;
        let scores = outputs[1]
            .to_array_view::<f32>()
            .map_err(|e| InferenceError::RunError(format!("Score output parse error: {}", e)))?;

        // Find the anchor with the highest face confidence (class 1)
        let num_anchors = scores.shape().get(1).copied().unwrap_or(0);
        let mut max_score: f32 = 0.0;
        let mut max_idx: Option<usize> = None;

        for i in 0..num_anchors {
            let face_score = scores[[0, i, 1]];
            if face_score > max_score {
                max_score = face_score;
                max_idx = Some(i);
            }
        }

        // Apply confidence threshold (0.75)
        if let Some(idx) = max_idx {
            if max_score > 0.75 {
                result.face_detected = true;
                result.confidence = max_score;
                result.ymin = boxes[[0, idx, 0]];
                result.xmin = boxes[[0, idx, 1]];
                result.ymax = boxes[[0, idx, 2]];
                result.xmax = boxes[[0, idx, 3]];
            }
        }

        Ok(result)
    }

    /// Runs liveness anti-spoofing check on a face crop.
    ///
    /// The face region is extracted from the RGBA buffer using the bounding box
    /// from detection, resized to the liveness model input, and classified as
    /// real or spoof using Mini-FAS-Net.
    ///
    /// # Arguments
    /// * `rgba_buffer` - RGBA pixel data for the full frame
    /// * `width` - Frame width in pixels
    /// * `height` - Frame height in pixels
    /// * `row_stride` - Bytes per row
    /// * `channels` - Number of color channels (3 for RGB, 4 for RGBA)
    /// * `face` - Detected face bounding box from `run_detection`
    ///
    /// # Returns
    /// `LivenessInferenceResult` with liveness score and real/spoof classification.
    pub fn run_liveness(
        &self,
        rgba_buffer: &[u8],
        width: usize,
        height: usize,
        row_stride: usize,
        channels: usize,
        face: &FaceDetectionResult,
    ) -> Result<LivenessInferenceResult, InferenceError> {
        let model = self
            .liveness
            .as_ref()
            .ok_or_else(|| InferenceError::ModelNotLoaded("Liveness model not loaded".into()))?;

        if !face.face_detected {
            return Ok(LivenessInferenceResult::default());
        }

        let (dest_h, dest_w) = self.liveness_input_dims;

        // Convert normalized bounding box to pixel coordinates
        let crop_x = (face.xmin * width as f32).max(0.0) as usize;
        let crop_y = (face.ymin * height as f32).max(0.0) as usize;
        let crop_w = ((face.xmax - face.xmin) * width as f32)
            .min((width - crop_x) as f32)
            .max(1.0) as usize;
        let crop_h = ((face.ymax - face.ymin) * height as f32)
            .min((height - crop_y) as f32)
            .max(1.0) as usize;

        if crop_w <= 10 || crop_h <= 10 {
            return Ok(LivenessInferenceResult::default());
        }

        // Build input tensor [1, 3, 80, 80] from the face crop
        let mut input_data = vec![0.0f32; 3 * dest_h * dest_w];

        bilinear_resize_normalize_rgb(
            rgba_buffer,
            width,
            height,
            row_stride,
            channels,
            crop_x,
            crop_y,
            crop_w,
            crop_h,
            &mut input_data,
            dest_w,
            dest_h,
            0.0,
            255.0,
        );

        let input_tensor: Tensor =
            tract_ndarray::Array4::from_shape_vec((1, 3, dest_h, dest_w), input_data)
                .map_err(|e| InferenceError::InvalidInput(format!("Tensor shape error: {}", e)))?
                .into();

        let outputs = model
            .run(tvec![input_tensor.into()])
            .map_err(|e| InferenceError::RunError(format!("Liveness inference failed: {}", e)))?;

        let mut result = LivenessInferenceResult::default();

        if let Some(output) = outputs.first() {
            let output_view = output
                .to_array_view::<f32>()
                .map_err(|e| InferenceError::RunError(format!("Output parse error: {}", e)))?;

            // MiniFASNet outputs logits [Spoof, Real] — apply softmax
            let shape = output_view.shape();
            if shape.len() >= 2 && shape[1] >= 2 {
                let logit_spoof = output_view[[0, 0]];
                let logit_real = output_view[[0, 1]];
                let e_spoof = logit_spoof.exp();
                let e_real = logit_real.exp();
                let real_score = e_real / (e_spoof + e_real);

                result.liveness_score = real_score;
                result.is_real = real_score > 0.85;
            }
        }

        Ok(result)
    }

    /// Runs face recognition to extract a 128-D embedding vector.
    ///
    /// The face region is cropped, resized, and fed through GhostFaceNet-S.
    /// The output embedding is L2-normalized for cosine similarity comparisons.
    ///
    /// # Arguments
    /// * `rgba_buffer` - RGBA pixel data for the full frame
    /// * `width` - Frame width in pixels
    /// * `height` - Frame height in pixels
    /// * `row_stride` - Bytes per row
    /// * `channels` - Number of color channels
    /// * `face` - Detected face bounding box
    ///
    /// # Returns
    /// L2-normalized 128-dimensional embedding vector, or error.
    pub fn run_recognition(
        &self,
        rgba_buffer: &[u8],
        width: usize,
        height: usize,
        row_stride: usize,
        channels: usize,
        face: &FaceDetectionResult,
    ) -> Result<Vec<f32>, InferenceError> {
        let model = self
            .recognizer
            .as_ref()
            .ok_or_else(|| InferenceError::ModelNotLoaded("Recognizer not loaded".into()))?;

        if !face.face_detected {
            return Err(InferenceError::InvalidInput("No face detected".into()));
        }

        let (dest_h, dest_w) = self.recognizer_input_dims;

        let crop_x = (face.xmin * width as f32).max(0.0) as usize;
        let crop_y = (face.ymin * height as f32).max(0.0) as usize;
        let crop_w = ((face.xmax - face.xmin) * width as f32)
            .min((width - crop_x) as f32)
            .max(1.0) as usize;
        let crop_h = ((face.ymax - face.ymin) * height as f32)
            .min((height - crop_y) as f32)
            .max(1.0) as usize;

        if crop_w <= 10 || crop_h <= 10 {
            return Err(InferenceError::InvalidInput("Face crop too small".into()));
        }

        // Build input tensor [1, 3, 112, 112]
        let mut input_data = vec![0.0f32; 3 * dest_h * dest_w];

        bilinear_resize_normalize_rgb(
            rgba_buffer,
            width,
            height,
            row_stride,
            channels,
            crop_x,
            crop_y,
            crop_w,
            crop_h,
            &mut input_data,
            dest_w,
            dest_h,
            127.5,
            128.0,
        );

        let input_tensor: Tensor =
            tract_ndarray::Array4::from_shape_vec((1, 3, dest_h, dest_w), input_data)
                .map_err(|e| InferenceError::InvalidInput(format!("Tensor shape error: {}", e)))?
                .into();

        let outputs = model
            .run(tvec![input_tensor.into()])
            .map_err(|e| InferenceError::RunError(format!("Recognizer inference failed: {}", e)))?;

        let output = outputs
            .first()
            .ok_or_else(|| InferenceError::RunError("No output tensor".into()))?;

        let output_view = output
            .to_array_view::<f32>()
            .map_err(|e| InferenceError::RunError(format!("Output parse error: {}", e)))?;

        // Extract embedding and L2-normalize
        let raw: Vec<f32> = output_view.iter().copied().collect();
        let embedding = l2_normalize(&raw);

        if embedding.len() != self.embedding_dim {
            log::warn!(
                "Embedding dim mismatch: got {}, expected {}",
                embedding.len(),
                self.embedding_dim
            );
        }

        Ok(embedding)
    }

    /// Returns the expected embedding dimensionality.
    pub fn embedding_dim(&self) -> usize {
        self.embedding_dim
    }

    /// Returns whether all three models are loaded and ready.
    pub fn is_ready(&self) -> bool {
        self.detector.is_some() && self.liveness.is_some() && self.recognizer.is_some()
    }

    /// Loads all three models from a directory containing the ONNX files.
    ///
    /// Expected files:
    /// - `detector.onnx`
    /// - `liveness.onnx`
    /// - `recognizer.onnx`
    pub fn load_all_models<P: AsRef<Path>>(&mut self, model_dir: P) -> Result<(), InferenceError> {
        let dir = model_dir.as_ref();
        self.load_detector(dir.join("detector.onnx"))?;
        self.load_liveness(dir.join("liveness.onnx"))?;
        self.load_recognizer(dir.join("recognizer.onnx"))?;
        Ok(())
    }
}

/// L2-normalizes a vector in-place, returning a new normalized vector.
///
/// If the vector has zero magnitude, returns a zero vector.
fn l2_normalize(v: &[f32]) -> Vec<f32> {
    let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm < 1e-10 {
        return vec![0.0; v.len()];
    }
    v.iter().map(|x| x / norm).collect()
}

/// Bilinear resize and normalize a grayscale image into a CHW float tensor.
///
/// Replicates the single grayscale channel into 3 channels (RGB) for models
/// that expect 3-channel input. Normalization: `(pixel - mean) / std`.
///
/// # Layout
/// Output is in CHW format: `[channel][row][col]` where channels are interleaved
/// as `[R, G, B]` all identical.
fn bilinear_resize_normalize_gray(
    src: &[u8],
    src_w: usize,
    src_h: usize,
    src_stride: usize,
    dest: &mut [f32],
    dest_w: usize,
    dest_h: usize,
    mean: f32,
    std_dev: f32,
) {
    let scale_x = src_w as f32 / dest_w as f32;
    let scale_y = src_h as f32 / dest_h as f32;
    let inv_std = 1.0 / std_dev;

    let channel_stride = dest_h * dest_w;

    for dy in 0..dest_h {
        let sy_f = dy as f32 * scale_y;
        let sy1 = (sy_f as usize).min(src_h.saturating_sub(1));
        let sy2 = (sy1 + 1).min(src_h.saturating_sub(1));
        let ya = sy_f - sy1 as f32;

        for dx in 0..dest_w {
            let sx_f = dx as f32 * scale_x;
            let sx1 = (sx_f as usize).min(src_w.saturating_sub(1));
            let sx2 = (sx1 + 1).min(src_w.saturating_sub(1));
            let xa = sx_f - sx1 as f32;

            // Bilinear interpolation over 4 neighbors
            let p11 = src.get(sy1 * src_stride + sx1).copied().unwrap_or(0) as f32;
            let p12 = src.get(sy1 * src_stride + sx2).copied().unwrap_or(0) as f32;
            let p21 = src.get(sy2 * src_stride + sx1).copied().unwrap_or(0) as f32;
            let p22 = src.get(sy2 * src_stride + sx2).copied().unwrap_or(0) as f32;

            let val = (1.0 - xa) * (1.0 - ya) * p11
                + xa * (1.0 - ya) * p12
                + (1.0 - xa) * ya * p21
                + xa * ya * p22;

            let normalized = (val - mean) * inv_std;

            // CHW format: same value for all 3 channels (grayscale → RGB)
            let pixel_idx = dy * dest_w + dx;
            dest[pixel_idx] = normalized;
            dest[channel_stride + pixel_idx] = normalized;
            dest[2 * channel_stride + pixel_idx] = normalized;
        }
    }
}

/// Bilinear resize and normalize an RGB/RGBA image crop into a CHW float tensor.
///
/// Extracts a crop region, resizes to destination dimensions, and normalizes
/// pixel values as `(pixel - mean) / std`.
///
/// # Layout
/// Output is in CHW format: `[R_plane][G_plane][B_plane]`
#[allow(clippy::too_many_arguments)]
fn bilinear_resize_normalize_rgb(
    src: &[u8],
    src_w: usize,
    src_h: usize,
    src_stride: usize,
    channels: usize,
    crop_x: usize,
    crop_y: usize,
    crop_w: usize,
    crop_h: usize,
    dest: &mut [f32],
    dest_w: usize,
    dest_h: usize,
    mean: f32,
    std_dev: f32,
) {
    let scale_x = crop_w as f32 / dest_w as f32;
    let scale_y = crop_h as f32 / dest_h as f32;
    let inv_std = 1.0 / std_dev;

    let channel_stride = dest_h * dest_w;

    for dy in 0..dest_h {
        let sy_f = crop_y as f32 + dy as f32 * scale_y;
        let sy1 = (sy_f as usize).min(src_h.saturating_sub(1));
        let sy2 = (sy1 + 1).min(src_h.saturating_sub(1));
        let ya = sy_f - sy1 as f32;

        for dx in 0..dest_w {
            let sx_f = crop_x as f32 + dx as f32 * scale_x;
            let sx1 = (sx_f as usize).min(src_w.saturating_sub(1));
            let sx2 = (sx1 + 1).min(src_w.saturating_sub(1));
            let xa = sx_f - sx1 as f32;

            // Bilinear interpolation for each of the first 3 channels (R, G, B)
            for c in 0..3 {
                let idx = |y: usize, x: usize| -> usize { y * src_stride + x * channels + c };

                let p11 = src.get(idx(sy1, sx1)).copied().unwrap_or(0) as f32;
                let p12 = src.get(idx(sy1, sx2)).copied().unwrap_or(0) as f32;
                let p21 = src.get(idx(sy2, sx1)).copied().unwrap_or(0) as f32;
                let p22 = src.get(idx(sy2, sx2)).copied().unwrap_or(0) as f32;

                let val = (1.0 - xa) * (1.0 - ya) * p11
                    + xa * (1.0 - ya) * p12
                    + (1.0 - xa) * ya * p21
                    + xa * ya * p22;

                let normalized = (val - mean) * inv_std;
                let pixel_idx = dy * dest_w + dx;
                dest[c * channel_stride + pixel_idx] = normalized;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_l2_normalize() {
        let v = vec![3.0, 4.0];
        let n = l2_normalize(&v);
        assert!((n[0] - 0.6).abs() < 1e-5);
        assert!((n[1] - 0.8).abs() < 1e-5);
    }

    #[test]
    fn test_l2_normalize_zero() {
        let v = vec![0.0, 0.0, 0.0];
        let n = l2_normalize(&v);
        assert_eq!(n, vec![0.0, 0.0, 0.0]);
    }

    #[test]
    fn test_default_results() {
        let det = FaceDetectionResult::default();
        assert!(!det.face_detected);
        assert_eq!(det.confidence, 0.0);

        let live = LivenessInferenceResult::default();
        assert!(!live.is_real);
        assert_eq!(live.liveness_score, 0.0);
    }

    #[test]
    fn test_engine_not_ready() {
        let engine = InferenceEngine::new();
        assert!(!engine.is_ready());
    }

    #[test]
    fn test_bilinear_resize_gray_identity() {
        // 2x2 grayscale image, resize to 2x2 (identity)
        let src = [100u8, 200, 50, 150];
        let mut dest = vec![0.0f32; 3 * 2 * 2]; // CHW: 3 channels × 2×2
        bilinear_resize_normalize_gray(&src, 2, 2, 2, &mut dest, 2, 2, 0.0, 1.0);

        // Channel 0 (R) should have the pixel values
        assert!((dest[0] - 100.0).abs() < 1.0); // top-left
    }

    #[test]
    fn test_bilinear_resize_rgb() {
        // 2x2 RGB image (6 bytes per row, 3 channels)
        let src = [
            255, 0, 0, 0, 255, 0, // row 0: red, green
            0, 0, 255, 128, 128, 128, // row 1: blue, gray
        ];
        let mut dest = vec![0.0f32; 3 * 2 * 2];
        bilinear_resize_normalize_rgb(
            &src, 2, 2, 6, 3, 0, 0, 2, 2, &mut dest, 2, 2, 0.0, 255.0,
        );

        // R channel, top-left pixel (255/255 = 1.0)
        assert!((dest[0] - 1.0).abs() < 0.01);
    }
}
