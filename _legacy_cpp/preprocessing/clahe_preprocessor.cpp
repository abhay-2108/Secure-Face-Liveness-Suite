#include "clahe_preprocessor.h"
#include <algorithm>
#include <cmath>
#include <cstring>

namespace NHAIEdgeAI {

CLAHEPreprocessor::CLAHEPreprocessor(float clipLimit, int tilesX, int tilesY)
    : m_clipLimit(clipLimit), m_tilesX(tilesX), m_tilesY(tilesY) {}

void CLAHEPreprocessor::calculateHistogram(const uint8_t* data, int startX, int startY, int tileWidth, int tileHeight, 
                                          int stride, int* hist) {
    std::memset(hist, 0, 256 * sizeof(int));
    for (int y = 0; y < tileHeight; ++y) {
        const uint8_t* rowPtr = data + (startY + y) * stride + startX;
        for (int x = 0; x < tileWidth; ++x) {
            hist[rowPtr[x]]++;
        }
    }
}

void CLAHEPreprocessor::clipHistogram(int* hist, int limit, int numPixels) {
    if (limit <= 0) return;

    int sumClipped = 0;
    for (int i = 0; i < 256; ++i) {
        if (hist[i] > limit) {
            sumClipped += hist[i] - limit;
            hist[i] = limit;
        }
    }

    // Redistribute the clipped pixels uniformly
    int redistributeAmount = sumClipped / 256;
    int residual = sumClipped % 256;

    for (int i = 0; i < 256; ++i) {
        hist[i] += redistributeAmount;
    }

    // Distribute residual pixels
    if (residual > 0) {
        int step = 256 / residual;
        for (int i = 0; i < 256 && residual > 0; i += step) {
            hist[i]++;
            residual--;
        }
    }
}

void CLAHEPreprocessor::cdfLut(const int* hist, float scale, uint8_t* lut) {
    int sum = 0;
    for (int i = 0; i < 256; ++i) {
        sum += hist[i];
        int val = static_cast<int>(sum * scale + 0.5f);
        lut[i] = static_cast<uint8_t>(std::min(255, std::max(0, val)));
    }
}

bool CLAHEPreprocessor::processGrayscaleInPlace(uint8_t* data, int width, int height) {
    if (data == nullptr || width <= 0 || height <= 0) {
        return false;
    }

    int tileW = width / m_tilesX;
    int tileH = height / m_tilesY;

    if (tileW <= 0 || tileH <= 0) return false;

    // Allocate memory for look-up tables (LUTs) for all tiles
    int numTiles = m_tilesX * m_tilesY;
    std::vector<uint8_t> luts(numTiles * 256);

    int numPixelsPerTile = tileW * tileH;
    int actualClipLimit = static_cast<int>(m_clipLimit * numPixelsPerTile / 256.0f);
    actualClipLimit = std::max(1, actualClipLimit);

    float scale = 255.0f / numPixelsPerTile;

    // Phase 1: Compute LUT for each tile
    for (int ty = 0; ty < m_tilesY; ++ty) {
        for (int tx = 0; tx < m_tilesX; ++tx) {
            int hist[256];
            int startX = tx * tileW;
            int startY = ty * tileH;

            calculateHistogram(data, startX, startY, tileW, tileH, width, hist);
            clipHistogram(hist, actualClipLimit, numPixelsPerTile);
            
            uint8_t* currentLut = &luts[(ty * m_tilesX + tx) * 256];
            cdfLut(hist, scale, currentLut);
        }
    }

    // Phase 2: Bilinear Interpolation across tiles to reconstruct the image smoothly
    std::vector<uint8_t> output(width * height);

    for (int y = 0; y < height; ++y) {
        // Calculate vertical interpolation parameters
        float ty = (static_cast<float>(y) - 0.5f) / tileH;
        int ty1 = std::max(0, static_cast<int>(std::floor(ty)));
        int ty2 = std::min(m_tilesY - 1, ty1 + 1);
        float ya = ty - ty1;

        for (int x = 0; x < width; ++x) {
            // Calculate horizontal interpolation parameters
            float tx = (static_cast<float>(x) - 0.5f) / tileW;
            int tx1 = std::max(0, static_cast<int>(std::floor(tx)));
            int tx2 = std::min(m_tilesX - 1, tx1 + 1);
            float xa = tx - tx1;

            uint8_t val = data[y * width + x];

            // Fetch LUT values for the 4 neighboring tiles
            uint8_t lut11 = luts[(ty1 * m_tilesX + tx1) * 256 + val];
            uint8_t lut12 = luts[(ty1 * m_tilesX + tx2) * 256 + val];
            uint8_t lut21 = luts[(ty2 * m_tilesX + tx1) * 256 + val];
            uint8_t lut22 = luts[(ty2 * m_tilesX + tx2) * 256 + val];

            // Perform bilinear interpolation
            float interpolated = (1.0f - xa) * (1.0f - ya) * lut11 +
                                 xa * (1.0f - ya) * lut12 +
                                 (1.0f - xa) * ya * lut21 +
                                 xa * ya * lut22;

            output[y * width + x] = static_cast<uint8_t>(std::min(255.0f, std::max(0.0f, interpolated + 0.5f)));
        }
    }

    // Copy back into original memory pointer (in-place modification)
    std::memcpy(data, output.data(), width * height);
    return true;
}

bool CLAHEPreprocessor::processYUV420Frame(uint8_t* yBuffer, int width, int height, int rowStrideY) {
    // For YUV420 buffers, the Y channel is identical to a grayscale image representation.
    // Standard rowStrideY is used to navigate row steps due to padding byte alignment.
    if (yBuffer == nullptr || width <= 0 || height <= 0 || rowStrideY < width) {
        return false;
    }
    
    // Perform processing directly over Y-Buffer, utilizing stride logic
    // (If rowStrideY equals width, we can run processGrayscaleInPlace directly)
    if (rowStrideY == width) {
        return processGrayscaleInPlace(yBuffer, width, height);
    }
    
    // Implement standard stride-aware grayscale in-place operations
    int tileW = width / m_tilesX;
    int tileH = height / m_tilesY;
    if (tileW <= 0 || tileH <= 0) return false;

    int numTiles = m_tilesX * m_tilesY;
    std::vector<uint8_t> luts(numTiles * 256);
    int numPixelsPerTile = tileW * tileH;
    int actualClipLimit = static_cast<int>(m_clipLimit * numPixelsPerTile / 256.0f);
    actualClipLimit = std::max(1, actualClipLimit);
    float scale = 255.0f / numPixelsPerTile;

    for (int ty = 0; ty < m_tilesY; ++ty) {
        for (int tx = 0; tx < m_tilesX; ++tx) {
            int hist[256];
            calculateHistogram(yBuffer, tx * tileW, ty * tileH, tileW, tileH, rowStrideY, hist);
            clipHistogram(hist, actualClipLimit, numPixelsPerTile);
            cdfLut(hist, scale, &luts[(ty * m_tilesX + tx) * 256]);
        }
    }

    for (int y = 0; y < height; ++y) {
        float ty = (static_cast<float>(y) - 0.5f) / tileH;
        int ty1 = std::max(0, static_cast<int>(std::floor(ty)));
        int ty2 = std::min(m_tilesY - 1, ty1 + 1);
        float ya = ty - ty1;

        uint8_t* rowPtr = yBuffer + y * rowStrideY;

        for (int x = 0; x < width; ++x) {
            float tx = (static_cast<float>(x) - 0.5f) / tileW;
            int tx1 = std::max(0, static_cast<int>(std::floor(tx)));
            int tx2 = std::min(m_tilesX - 1, tx1 + 1);
            float xa = tx - tx1;

            uint8_t val = rowPtr[x];

            uint8_t lut11 = luts[(ty1 * m_tilesX + tx1) * 256 + val];
            uint8_t lut12 = luts[(ty1 * m_tilesX + tx2) * 256 + val];
            uint8_t lut21 = luts[(ty2 * m_tilesX + tx1) * 256 + val];
            uint8_t lut22 = luts[(ty2 * m_tilesX + tx2) * 256 + val];

            float interpolated = (1.0f - xa) * (1.0f - ya) * lut11 +
                                 xa * (1.0f - ya) * lut12 +
                                 (1.0f - xa) * ya * lut21 +
                                 xa * ya * lut22;

            rowPtr[x] = static_cast<uint8_t>(std::min(255.0f, std::max(0.0f, interpolated + 0.5f)));
        }
    }
    return true;
}

bool CLAHEPreprocessor::processRGBAInPlace(uint8_t* rgbaData, int width, int height) {
    if (rgbaData == nullptr || width <= 0 || height <= 0) {
        return false;
    }

    int totalPixels = width * height;
    std::vector<uint8_t> yChannel(totalPixels);

    // 1. Separate Luminance channel (Y) in-place using fast integer coefficients
    // Y = (R * 77 + G * 150 + B * 29) >> 8
    for (int i = 0; i < totalPixels; ++i) {
        int idx = i * 4;
        uint8_t r = rgbaData[idx];
        uint8_t g = rgbaData[idx + 1];
        uint8_t b = rgbaData[idx + 2];
        yChannel[i] = static_cast<uint8_t>((r * 77 + g * 150 + b * 29) >> 8);
    }

    // 2. Perform Grayscale CLAHE on the isolated Y channel
    if (!processGrayscaleInPlace(yChannel.data(), width, height)) {
        return false;
    }

    // 3. Blend equalized Y channel back to RGBA to adjust original channel intensities proportionately
    for (int i = 0; i < totalPixels; ++i) {
        int idx = i * 4;
        uint8_t oldY = static_cast<uint8_t>((rgbaData[idx] * 77 + rgbaData[idx + 1] * 150 + rgbaData[idx + 2] * 29) >> 8);
        uint8_t newY = yChannel[i];

        if (oldY == 0) {
            rgbaData[idx] = newY;
            rgbaData[idx + 1] = newY;
            rgbaData[idx + 2] = newY;
        } else {
            // Apply proportional brightness adjustment ratio
            float scale = static_cast<float>(newY) / oldY;
            rgbaData[idx] = static_cast<uint8_t>(std::min(255.0f, rgbaData[idx] * scale));
            rgbaData[idx + 1] = static_cast<uint8_t>(std::min(255.0f, rgbaData[idx + 1] * scale));
            rgbaData[idx + 2] = static_cast<uint8_t>(std::min(255.0f, rgbaData[idx + 2] * scale));
        }
        // Alpha (rgbaData[idx+3]) remains unmodified.
    }

    return true;
}

} // namespace NHAIEdgeAI
