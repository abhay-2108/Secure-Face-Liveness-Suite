#include "optical_flow.h"
#include <cmath>
#include <algorithm>
#include <vector>
#include <numeric>
#include <cstring>

namespace NHAIEdgeAI {

OpticalFlowValidator::OpticalFlowValidator(int gridRows, int gridCols)
    : m_gridRows(gridRows), m_gridCols(gridCols) {}

void OpticalFlowValidator::computeBlockMotion(const uint8_t* curr, const uint8_t* prev, 
                                              int width, int height, int stride,
                                              int blockX, int blockY, int blockW, int blockH,
                                              int searchRange, int& dx, int& dy) {
    dx = 0;
    dy = 0;
    int minSAD = 1 << 30; // Initialize with a very large value

    // Constrain search bounds to prevent reading past image boundaries
    int startSearchX = std::max(0, blockX - searchRange);
    int endSearchX = std::min(width - blockW, blockX + searchRange);
    int startSearchY = std::max(0, blockY - searchRange);
    int endSearchY = std::min(height - blockH, blockY + searchRange);

    for (int sy = startSearchY; sy <= endSearchY; ++sy) {
        for (int sx = startSearchX; sx <= endSearchX; ++sx) {
            int currentSAD = 0;
            
            // Subsampled fast SAD comparison (compares every alternate row to double speed)
            for (int by = 0; by < blockH; by += 2) {
                const uint8_t* currRow = curr + (blockY + by) * stride + blockX;
                const uint8_t* prevRow = prev + (sy + by) * stride + sx;
                
                for (int bx = 0; bx < blockW; ++bx) {
                    currentSAD += std::abs(currRow[bx] - prevRow[bx]);
                }
            }

            if (currentSAD < minSAD) {
                minSAD = currentSAD;
                dx = sx - blockX;
                dy = sy - blockY;
            }
        }
    }
}

ActiveLivenessResult OpticalFlowValidator::validateParallax(const uint8_t* currFrame, const uint8_t* prevFrame,
                                                           int width, int height, int rowStride,
                                                           int faceX, int faceY, int faceW, int faceH) {
    ActiveLivenessResult result;

    if (currFrame == nullptr || prevFrame == nullptr || width <= 0 || height <= 0 || faceW <= 10 || faceH <= 10) {
        result.passed = false;
        result.details = "INVALID_PARAMETERS";
        return result;
    }

    // Segment the face bounding box into a 3x3 grid
    int cellW = faceW / m_gridCols;
    int cellH = faceH / m_gridRows;

    if (cellW <= 4 || cellH <= 4) {
        result.passed = false;
        result.details = "FACE_TOO_SMALL";
        return result;
    }

    // Restricted search range to ensure ultra-low execution latency
    int searchRange = 8; 

    std::vector<float> motionMags;
    float centerMag = 0.0f;
    float sumPeripheralMags = 0.0f;
    int peripheralCount = 0;

    // Evaluate SAD block matching over the 3x3 grid
    for (int r = 0; r < m_gridRows; ++r) {
        for (int c = 0; c < m_gridCols; ++c) {
            int blockX = faceX + c * cellW;
            int blockY = faceY + r * cellH;

            // Make sure block fits inside image limits
            blockX = std::max(0, std::min(blockX, width - cellW));
            blockY = std::max(0, std::min(blockY, height - cellH));

            int dx = 0;
            int dy = 0;
            computeBlockMotion(currFrame, prevFrame, width, height, rowStride,
                               blockX, blockY, cellW, cellH, searchRange, dx, dy);

            float mag = std::sqrt(static_cast<float>(dx * dx + dy * dy));
            motionMags.push_back(mag);

            // Row 1, Col 1 corresponds to the grid center block (typically nose/forehead area)
            if (r == 1 && c == 1) {
                centerMag = mag;
            } else {
                sumPeripheralMags += mag;
                peripheralCount++;
            }
        }
    }

    // 1. Evaluate average frame movement (to verify if user actually turned their head)
    float sumAllMags = std::accumulate(motionMags.begin(), motionMags.end(), 0.0f);
    float meanMag = sumAllMags / motionMags.size();

    // If mean motion is near-zero, the user is stationary or the face hasn't moved
    if (meanMag < 0.5f) {
        result.passed = false;
        result.variance = 0.0f;
        result.parallaxRatio = 1.0f;
        result.details = "NO_MOTION_DETECTED";
        return result;
    }

    // 2. Compute motion magnitude variance across the grid
    float sumSquareDiff = 0.0f;
    for (float mag : motionMags) {
        sumSquareDiff += (mag - meanMag) * (mag - meanMag);
    }
    float variance = sumSquareDiff / motionMags.size();

    // 3. Compute the Center-to-Peripheral Parallax Ratio
    float meanPeripheral = sumPeripheralMags / peripheralCount;
    float parallaxRatio = centerMag / (meanPeripheral + 0.001f);

    result.variance = variance;
    result.parallaxRatio = parallaxRatio;

    // 4. Parallax Classification Logic:
    // A 3D human head turning creates non-uniform motion: center (nose) moves faster/differently 
    // than the boundary (ears). Variance is high, and the parallax ratio departs significantly from 1.0.
    // A flat 2D plane (photo/iPad screen) rotated in front of the camera moves as a rigid plane.
    // Every single grid block shifts uniformly, resulting in near-zero variance and a parallax ratio of ~1.0.
    
    // Thresholds:
    // - Flat Uniform Motion Threshold: Variance < 0.12 (highly uniform displacement field)
    // - Flat Uniform Ratio Threshold: Parallax ratio stays within a tight window [0.85, 1.15]
    if (variance < 0.12f && (parallaxRatio >= 0.85f && parallaxRatio <= 1.15f)) {
        result.passed = false;
        result.details = "UNIFORM_FLOW_SPOOF_DETECTED";
    } else {
        result.passed = true;
        result.details = "3D_PARALLAX_CONFIRMED";
    }

    return result;
}

} // namespace NHAIEdgeAI
