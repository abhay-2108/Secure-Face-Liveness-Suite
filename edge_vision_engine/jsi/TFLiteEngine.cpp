#include "TFLiteEngine.h"
#include "tensorflow/lite/interpreter.h"
#include "tensorflow/lite/model.h"
#include "tensorflow/lite/kernels/register.h"
#include <cmath>
#include <cstring>
#include <algorithm>
#include <vector>

namespace NHAIEdgeAI {

TFLiteEngine::TFLiteEngine() = default;
TFLiteEngine::~TFLiteEngine() = default;

bool TFLiteEngine::createInterpreter(const std::unique_ptr<tflite::FlatBufferModel>& model, 
                                     std::unique_ptr<tflite::Interpreter>& interpreter) {
    if (!model) return false;

    // Use default BuiltinOpResolver to support standard TFLite ops
    tflite::ops::builtin::BuiltinOpResolver resolver;
    tflite::InterpreterBuilder builder(*model, resolver);
    
    if (builder(&interpreter) != kTfLiteOk) {
        return false;
    }

    if (!interpreter) return false;

    // Allocate memory for tensors
    if (interpreter->AllocateTensors() != kTfLiteOk) {
        return false;
    }

    // Set thread pool size (e.g. 2 threads for low-latency on low-end ARM quadcore CPUs)
    interpreter->SetNumThreads(2);
    return true;
}

bool TFLiteEngine::loadDetectorModel(const std::string& modelPath) {
    // BuildFromFile automatically uses system memory mapping (mmap)
    // The model is paged in directly from disk, preventing heavy heap allocations and OOMs.
    m_detectorModel = tflite::FlatBufferModel::BuildFromFile(modelPath.c_str());
    return createInterpreter(m_detectorModel, m_detectorInterpreter);
}

bool TFLiteEngine::loadLivenessModel(const std::string& modelPath) {
    m_livenessModel = tflite::FlatBufferModel::BuildFromFile(modelPath.c_str());
    return createInterpreter(m_livenessModel, m_livenessInterpreter);
}

bool TFLiteEngine::loadRecognitionModel(const std::string& modelPath) {
    m_recognitionModel = tflite::FlatBufferModel::BuildFromFile(modelPath.c_str());
    return createInterpreter(m_recognitionModel, m_recognitionInterpreter);
}

/**
 * High-performance, zero-allocation bilinear interpolation image resizing.
 * Resizes a region of an input frame (crop) directly into a destination buffer.
 */
static void bilinearResizeAndNormalize(const uint8_t* src, int srcW, int srcH, int srcStride, int channels,
                                       int cropX, int cropY, int cropW, int cropH,
                                       float* dest, int destW, int destH, 
                                       float mean, float stdDev) {
    float scaleX = static_cast<float>(cropW) / destW;
    float scaleY = static_cast<float>(cropH) / destH;

    for (int dy = 0; dy < destH; ++dy) {
        float sy = cropY + dy * scaleY;
        int sy1 = std::max(0, std::min(static_cast<int>(std::floor(sy)), srcH - 1));
        int sy2 = std::max(0, std::min(sy1 + 1, srcH - 1));
        float ya = sy - sy1;

        for (int dx = 0; dx < destW; ++dx) {
            float sx = cropX + dx * scaleX;
            int sx1 = std::max(0, std::min(static_cast<int>(std::floor(sx)), srcW - 1));
            int sx2 = std::max(0, std::min(sx1 + 1, srcW - 1));
            float xa = sx - sx1;

            int destIdx = (dy * destW + dx) * channels;

            for (int c = 0; c < channels; ++c) {
                // Fetch 4 neighboring pixels
                uint8_t p11 = src[sy1 * srcStride + sx1 * channels + c];
                uint8_t p12 = src[sy1 * srcStride + sx2 * channels + c];
                uint8_t p21 = src[sy2 * srcStride + sx1 * channels + c];
                uint8_t p22 = src[sy2 * srcStride + sx2 * channels + c];

                // Interpolate
                float val = (1.0f - xa) * (1.0f - ya) * p11 +
                            xa * (1.0f - ya) * p12 +
                            (1.0f - xa) * ya * p21 +
                            xa * ya * p22;

                // Normalize in-place to float32
                dest[destIdx + c] = (val - mean) / stdDev;
            }
        }
    }
}

FaceDetectionResult TFLiteEngine::runFaceDetection(const uint8_t* grayBuffer, int width, int height, int rowStride) {
    FaceDetectionResult result;
    if (!m_detectorInterpreter) return result;

    // Linzaer RFB Detector TFLite typical input: 1 x 240 x 320 x 1 (or 300x300)
    int inputTensorIdx = m_detectorInterpreter->inputs()[0];
    TfLiteTensor* inputTensor = m_detectorInterpreter->tensor(inputTensorIdx);

    int destH = inputTensor->dims->data[1];
    int destW = inputTensor->dims->data[2];
    int channels = inputTensor->dims->data[3];

    float* inputBuffer = m_detectorInterpreter->typed_tensor<float>(inputTensorIdx);
    if (!inputBuffer) return result;

    // Grayscale bilinear resize & normalization (mean=127.5, std=128.0)
    bilinearResizeAndNormalize(grayBuffer, width, height, rowStride, 1, 
                               0, 0, width, height, 
                               inputBuffer, destW, destH, 127.5f, 128.0f);

    // Execute Inference
    if (m_detectorInterpreter->Invoke() != kTfLiteOk) {
        return result;
    }

    // Read outputs (Typically returns bounding boxes and confidence scores)
    // For Linzaer RFB INT8/Float, outputs are: [boxes, scores]
    int boxesTensorIdx = m_detectorInterpreter->outputs()[0];
    int scoresTensorIdx = m_detectorInterpreter->outputs()[1];

    float* boxes = m_detectorInterpreter->typed_tensor<float>(boxesTensorIdx);
    float* scores = m_detectorInterpreter->typed_tensor<float>(scoresTensorIdx);

    if (!boxes || !scores) return result;

    // Parse output for highest confidence score
    float maxScore = 0.0f;
    int maxIdx = -1;
    
    // Detector outputs typically shape [1, NumAnchors, 4] and [1, NumAnchors, 2]
    int numAnchors = m_detectorInterpreter->tensor(scoresTensorIdx)->dims->data[1];

    for (int i = 0; i < numAnchors; ++i) {
        // Class 1 is typical "Face" confidence, Class 0 is background
        float faceScore = scores[i * 2 + 1]; 
        if (faceScore > maxScore) {
            maxScore = faceScore;
            maxIdx = i;
        }
    }

    // Apply high confidence threshold (e.g. > 0.75)
    if (maxIdx != -1 && maxScore > 0.75f) {
        result.faceDetected = true;
        result.confidence = maxScore;
        
        // Coordinates extracted relative to dimensions
        result.ymin = boxes[maxIdx * 4 + 0];
        result.xmin = boxes[maxIdx * 4 + 1];
        result.ymax = boxes[maxIdx * 4 + 2];
        result.xmax = boxes[maxIdx * 4 + 3];
    }

    return result;
}

LivenessResult TFLiteEngine::runLivenessCheck(const uint8_t* rgbaBuffer, int width, int height, int rowStride, int channels, const FaceDetectionResult& face) {
    LivenessResult result;
    if (!m_livenessInterpreter || !face.faceDetected) return result;

    int inputTensorIdx = m_livenessInterpreter->inputs()[0];
    TfLiteTensor* inputTensor = m_livenessInterpreter->tensor(inputTensorIdx);

    int destH = inputTensor->dims->data[1]; // typical: 80x80
    int destW = inputTensor->dims->data[2];

    float* inputBuffer = m_livenessInterpreter->typed_tensor<float>(inputTensorIdx);
    if (!inputBuffer) return result;

    // Convert relative bounding box to absolute pixel coordinates
    int cropX = std::max(0, static_cast<int>(face.xmin * width));
    int cropY = std::max(0, static_cast<int>(face.ymin * height));
    int cropW = std::min(width - cropX, static_cast<int>((face.xmax - face.xmin) * width));
    int cropH = std::min(height - cropY, static_cast<int>((face.ymax - face.ymin) * height));

    if (cropW <= 10 || cropH <= 10) return result;

    // Resize and normalize RGB face crop to liveness input tensor (mean=0.0, std=255.0)
    bilinearResizeAndNormalize(rgbaBuffer, width, height, rowStride, channels,
                               cropX, cropY, cropW, cropH,
                               inputBuffer, destW, destH, 0.0f, 255.0f);

    // Invoke Liveness model
    if (m_livenessInterpreter->Invoke() != kTfLiteOk) {
        return result;
    }

    int outputTensorIdx = m_livenessInterpreter->outputs()[0];
    float* output = m_livenessInterpreter->typed_tensor<float>(outputTensorIdx);

    if (output) {
        // MiniFASNet typically outputs logits for [Spoof, Real]
        // Apply softmax over output to compute the real class score
        float eSpoof = std::exp(output[0]);
        float eReal = std::exp(output[1]);
        float realScore = eReal / (eSpoof + eReal);

        result.livenessScore = realScore;
        result.isReal = (realScore > 0.85f); // 85% liveness threshold
    }

    return result;
}

std::vector<float> TFLiteEngine::runFaceRecognition(const uint8_t* rgbaBuffer, int width, int height, int rowStride, int channels, const FaceDetectionResult& face) {
    std::vector<float> embedding;
    if (!m_recognitionInterpreter || !face.faceDetected) return embedding;

    int inputTensorIdx = m_recognitionInterpreter->inputs()[0];
    TfLiteTensor* inputTensor = m_recognitionInterpreter->tensor(inputTensorIdx);

    int destH = inputTensor->dims->data[1]; // typical: 112x112
    int destW = inputTensor->dims->data[2];

    float* inputBuffer = m_recognitionInterpreter->typed_tensor<float>(inputTensorIdx);
    if (!inputBuffer) return embedding;

    // Convert relative bounding box to absolute pixel coordinates
    int cropX = std::max(0, static_cast<int>(face.xmin * width));
    int cropY = std::max(0, static_cast<int>(face.ymin * height));
    int cropW = std::min(width - cropX, static_cast<int>((face.xmax - face.xmin) * width));
    int cropH = std::min(height - cropY, static_cast<int>((face.ymax - face.ymin) * height));

    if (cropW <= 10 || cropH <= 10) return embedding;

    // Resize and normalize RGB face crop to GhostFaceNet standard inputs
    // Mean = 127.5, Std = 128.0
    bilinearResizeAndNormalize(rgbaBuffer, width, height, rowStride, channels,
                               cropX, cropY, cropW, cropH,
                               inputBuffer, destW, destH, 127.5f, 128.0f);

    // Invoke Face Recognition model
    if (m_recognitionInterpreter->Invoke() != kTfLiteOk) {
        return embedding;
    }

    int outputTensorIdx = m_recognitionInterpreter->outputs()[0];
    float* output = m_recognitionInterpreter->typed_tensor<float>(outputTensorIdx);
    int outputSize = m_recognitionInterpreter->tensor(outputTensorIdx)->dims->data[1]; // 128

    if (output && outputSize > 0) {
        embedding.assign(output, output + outputSize);
    }

    return embedding;
}

} // namespace NHAIEdgeAI
