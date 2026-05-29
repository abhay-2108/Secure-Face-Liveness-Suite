import cv2
import numpy as np

class CLAHEPreprocessor:
    """
    Python-based Reference Implementation for Contrast Limited Adaptive Histogram Equalization.
    Preprocesses outdoor toll booth camera frames to normalize high sunlight reflections,
    under-canopy shadows, and low-light exposure.
    """
    def __init__(self, clip_limit=2.0, tile_grid_size=(8, 8)):
        self.clip_limit = clip_limit
        self.tile_grid_size = tile_grid_size
        self.clahe = cv2.createCLAHE(clipLimit=self.clip_limit, tileGridSize=self.tile_grid_size)

    def process_rgb(self, frame: np.ndarray) -> np.ndarray:
        """
        Converts RGB frame to YUV, applies CLAHE to the Y (Luminance) channel, and returns RGB.
        This preserves natural color rendering while balancing the lighting levels.
        """
        if frame is None:
            raise ValueError("Input frame is empty.")
            
        # 1. Convert RGB to YUV (Y contains brightness, U/V contain color information)
        yuv = cv2.cvtColor(frame, cv2.COLOR_RGB2YUV)
        
        # 2. Apply CLAHE only to the Y (Luminance) channel
        yuv[:, :, 0] = self.clahe.apply(yuv[:, :, 0])
        
        # 3. Convert back to RGB
        equalized_frame = cv2.cvtColor(yuv, cv2.COLOR_YUV2RGB)
        return equalized_frame

    def process_grayscale(self, frame: np.ndarray) -> np.ndarray:
        """
        Applies CLAHE directly to a single-channel grayscale frame.
        """
        if frame is None:
            raise ValueError("Input frame is empty.")
        if len(frame.shape) != 2:
            frame = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)
        return self.clahe.apply(frame)

    def analyze_lighting(self, frame: np.ndarray) -> dict:
        """
        Calculates diagnostic metrics of the image lighting to justify preprocessing:
        - Mean Luminance (overall brightness)
        - Luminance Standard Deviation (contrast measure)
        - Low-light pixels percentage (Shadow coverage)
        - High-exposure pixels percentage (Sunlight washout)
        """
        # Convert to Grayscale if RGB
        if len(frame.shape) == 3:
            gray = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)
        else:
            gray = frame.copy()
            
        total_pixels = gray.size
        mean_lum = np.mean(gray)
        std_lum = np.std(gray)
        
        # Threshold definitions:
        # Shadows are defined as brightness < 50 (on a scale of 0-255)
        # Sunlight highlights are defined as brightness > 220
        shadow_pixels = np.sum(gray < 50)
        sunlight_pixels = np.sum(gray > 220)
        
        return {
            "mean_luminance": float(mean_lum),
            "contrast_std": float(std_lum),
            "shadow_ratio": float(shadow_pixels / total_pixels),
            "sunlight_washout_ratio": float(sunlight_pixels / total_pixels)
        }


if __name__ == "__main__":
    print("[INIT] Starting Python CLAHE Preprocessor diagnostic validation...")
    
    # 1. Generate a mock high-contrast frame simulating toll-gate lighting
    mock_frame = np.zeros((112, 112, 3), dtype=np.uint8)
    # Generate a horizontal gradient from dark to light
    for x in range(112):
        mock_frame[:, x, :] = int(20 + (210 * x / 111))
    
    # Add a mid-tone face region center block
    mock_frame[30:80, 30:80, :] = 120
    
    # 2. Analyze the input frame lighting profile
    preprocessor = CLAHEPreprocessor(clip_limit=3.0, tile_grid_size=(4, 4))
    initial_metrics = preprocessor.analyze_lighting(mock_frame)
    print("\n--- Raw Lighting Metrics ---")
    print(f"Mean Luminance: {initial_metrics['mean_luminance']:.2f} (Target: 100-150)")
    print(f"Contrast Std Dev: {initial_metrics['contrast_std']:.2f}")
    print(f"Shadow Area Ratio: {initial_metrics['shadow_ratio'] * 100:.1f}%")
    print(f"Harsh Sunlight Washout: {initial_metrics['sunlight_washout_ratio'] * 100:.1f}%")
    
    # 3. Process the frame using CLAHE
    processed_frame = preprocessor.process_rgb(mock_frame)
    post_metrics = preprocessor.analyze_lighting(processed_frame)
    
    print("\n--- Post-CLAHE Lighting Metrics ---")
    print(f"Mean Luminance: {post_metrics['mean_luminance']:.2f}")
    print(f"Contrast Std Dev (Balanced): {post_metrics['contrast_std']:.2f}")
    print(f"Shadow Area Ratio: {post_metrics['shadow_ratio'] * 100:.1f}%")
    print(f"Harsh Sunlight Washout: {post_metrics['sunlight_washout_ratio'] * 100:.1f}%")
    
    # Robust Validation Assertions
    assert processed_frame.shape == mock_frame.shape, "CLAHE altered image dimensions."
    assert abs(post_metrics['mean_luminance'] - initial_metrics['mean_luminance']) < 15.0, "Luminance shifted excessively."
    assert post_metrics['contrast_std'] != initial_metrics['contrast_std'], "Luminance contrast was unmodified."
    print("\n[SUCCESS] CLAHE preprocessor mathematically validated!")
