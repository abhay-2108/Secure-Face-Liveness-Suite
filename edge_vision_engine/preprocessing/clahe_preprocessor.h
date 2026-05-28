#ifndef CLAHE_PREPROCESSOR_H
#define CLAHE_PREPROCESSOR_H

#include <cstdint>
#include <vector>

namespace NHAIEdgeAI {

/**
 * Highly optimized, thread-safe C++ CLAHE implementation for edge deployment.
 * Tailored for low-latency (< 5ms) processing on low-end 3GB RAM devices running Android 8+ / iOS 12+.
 */
class CLAHEPreprocessor {
public:
    /**
     * Constructor
     * @param clipLimit: Contrast limiting factor (default: 2.0). Higher values increase contrast.
     * @param tilesX: Number of horizontal grid subdivisions (default: 8)
     * @param tilesY: Number of vertical grid subdivisions (default: 8)
     */
    CLAHEPreprocessor(float clipLimit = 2.0f, int tilesX = 8, int tilesY = 8);
    
    ~CLAHEPreprocessor() = default;

    /**
     * Processes a single-channel grayscale buffer (e.g. Luminance/Y channel from YUV420).
     * Modifies the buffer IN-PLACE to ensure zero memory allocation overhead.
     * 
     * @param data: Pointer to raw uint8_t image array
     * @param width: Image width in pixels
     * @param height: Image height in pixels
     * @return true if processing was successful, false otherwise
     */
    bool processGrayscaleInPlace(uint8_t* data, int width, int height);

    /**
     * Processes a raw YUV420sp (NV21 / NV12) frame pointer (direct camera memory).
     * Equalizes ONLY the Y channel, leaving chromatic U/V channels intact to save resources.
     * 
     * @param yBuffer: Pointer to raw Y (Luminance) channel array
     * @param width: Width of the camera frame
     * @param height: Height of the camera frame
     * @param rowStrideY: Memory byte-stride of the Y channel
     */
    bool processYUV420Frame(uint8_t* yBuffer, int width, int height, int rowStrideY);

    /**
     * Processes a raw 32-bit RGBA buffer in-place (typical for iOS AVFoundation frame buffers).
     * Extracts luminance, performs CLAHE, and blends back, ensuring sub-5ms latency.
     * 
     * @param rgbaData: Pointer to raw RGBA buffer
     * @param width: Frame width
     * @param height: Frame height
     */
    bool processRGBAInPlace(uint8_t* rgbaData, int width, int height);

private:
    float m_clipLimit;
    int m_tilesX;
    int m_tilesY;

    // Helper functions for custom high-performance integer CLAHE calculation
    void calculateHistogram(const uint8_t* data, int startX, int startY, int tileWidth, int tileHeight, 
                            int stride, int* hist);
    void clipHistogram(int* hist, int limit, int numPixels);
    void cdfLut(const int* hist, float scale, uint8_t* lut);
};

} // namespace NHAIEdgeAI

#endif // CLAHE_PREPROCESSOR_H
