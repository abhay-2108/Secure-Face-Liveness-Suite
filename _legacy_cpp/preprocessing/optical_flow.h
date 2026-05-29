#ifndef OPTICAL_FLOW_H
#define OPTICAL_FLOW_H

#include <vector>
#include <cstdint>

namespace NHAIEdgeAI {

/**
 * Struct representing the results of Active Liveness checks.
 */
struct ActiveLivenessResult {
    bool passed = false;
    float variance = 0.0f;
    float parallaxRatio = 0.0f;
    const char* details = "UNKNOWN";
};

/**
 * Highly optimized C++ engine for Active Liveness detection.
 * Bypasses heavy pixel-by-pixel dense Farneback flow by executing a fast grid block-matching 
 * SAD (Sum of Absolute Differences) algorithm. Analyzes vector uniformity to distinguish
 * 3D non-rigid face rotation parallax from rigid 2D flat photo/screen translation.
 */
class OpticalFlowValidator {
public:
    /**
     * Constructor
     * @param gridRows: Horizontal grid divisions (default: 3)
     * @param gridCols: Vertical grid divisions (default: 3)
     */
    OpticalFlowValidator(int gridRows = 3, int gridCols = 3);
    ~OpticalFlowValidator() = default;

    /**
     * Executes Active Liveness Parallax Validation over consecutive frames.
     * 
     * @param currFrame: Current grayscale frame buffer pointer
     * @param prevFrame: Previous cached grayscale frame buffer pointer
     * @param width: Image width in pixels
     * @param height: Image height in pixels
     * @param rowStride: Memory stride of the buffers
     * @param faceX: Face bounding box left boundary pixel coordinate
     * @param faceY: Face bounding box top boundary pixel coordinate
     * @param faceW: Face bounding box width in pixels
     * @param faceH: Face bounding box height in pixels
     */
    ActiveLivenessResult validateParallax(const uint8_t* currFrame, const uint8_t* prevFrame,
                                         int width, int height, int rowStride,
                                         int faceX, int faceY, int faceW, int faceH);

private:
    int m_gridRows;
    int m_gridCols;

    /**
     * Helper to compute motion displacement (dx, dy) for a single block using Sum of Absolute Differences (SAD).
     * Search range is restricted to a small neighborhood to guarantee low CPU cycles (< 0.1ms per block).
     */
    void computeBlockMotion(const uint8_t* curr, const uint8_t* prev, 
                            int width, int height, int stride,
                            int blockX, int blockY, int blockW, int blockH,
                            int searchRange, int& dx, int& dy);
};

} // namespace NHAIEdgeAI

#endif // OPTICAL_FLOW_H
