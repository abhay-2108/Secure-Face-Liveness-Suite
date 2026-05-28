#ifndef TFLITE_ENGINE_H
#define TFLITE_ENGINE_H

#include <memory>
#include <string>
#include <vector>
#include <cstdint>

// Forward declarations of TensorFlow Lite objects to avoid header dependency bloat
namespace tflite {
    class FlatBufferModel;
    class Interpreter;
}

namespace NHAIEdgeAI {

/**
 * Struct representing details of a detected face.
 */
struct FaceDetectionResult {
    bool faceDetected = false;
    float ymin = 0.0f;
    float xmin = 0.0f;
    float ymax = 0.0f;
    float xmax = 0.0f;
    float confidence = 0.0f;
};

/**
 * Struct representing liveness verification results.
 */
struct LivenessResult {
    bool isReal = false;
    float livenessScore = 0.0f;
};

/**
 * Highly optimized C++ wrapper for managing three chained TFLite INT8 models.
 * Model files are loaded via mmap (FlatBufferModel::BuildFromFile) to avoid 
 * high RAM heap consumption, allowing execution on low-memory (3GB RAM) Android 8+ devices.
 */
class TFLiteEngine {
public:
    TFLiteEngine();
    ~TFLiteEngine();

    /**
     * Loads the Face Detector model (Linzaer 1MB version-RFB) via memory mapping.
     */
    bool loadDetectorModel(const std::string& modelPath);

    /**
     * Loads the Liveness model (Mini-FAS-Net) via memory mapping.
     */
    bool loadLivenessModel(const std::string& modelPath);

    /**
     * Loads the Face Recognition model (GhostFaceNet-S INT8) via memory mapping.
     */
    bool loadRecognitionModel(const std::string& modelPath);

    /**
     * Runs face detection on a processed grayscale luminance buffer.
     * Uses the 1MB Detector model optimized for low-latency bounding box extraction.
     */
    FaceDetectionResult runFaceDetection(const uint8_t* grayBuffer, int width, int height, int rowStride);

    /**
     * Runs silent liveness analysis on the cropped facial bounding box.
     * Mini-FAS-Net detects printed photos and digital replay spoofing attacks.
     * Supports variable 3-channel (RGB) and 4-channel (RGBA/BGRA) strides.
     */
    LivenessResult runLivenessCheck(const uint8_t* rgbaBuffer, int width, int height, int rowStride, int channels, const FaceDetectionResult& face);

    /**
     * Runs GhostFaceNet-S to generate a 128-dimensional biometric embedding vector.
     * Performs inference strictly on the cropped and resized facial image.
     * Supports variable 3-channel (RGB) and 4-channel (RGBA/BGRA) strides.
     */
    std::vector<float> runFaceRecognition(const uint8_t* rgbaBuffer, int width, int height, int rowStride, int channels, const FaceDetectionResult& face);

private:
    // Memory-mapped FlatBuffer models
    std::unique_ptr<tflite::FlatBufferModel> m_detectorModel;
    std::unique_ptr<tflite::FlatBufferModel> m_livenessModel;
    std::unique_ptr<tflite::FlatBufferModel> m_recognitionModel;

    // TFLite Interpreters for execution
    std::unique_ptr<tflite::Interpreter> m_detectorInterpreter;
    std::unique_ptr<tflite::Interpreter> m_livenessInterpreter;
    std::unique_ptr<tflite::Interpreter> m_recognitionInterpreter;

    // Helper to instantiate an interpreter given a memory-mapped model
    bool createInterpreter(const std::unique_ptr<tflite::FlatBufferModel>& model, 
                           std::unique_ptr<tflite::Interpreter>& interpreter);
};

} // namespace NHAIEdgeAI

#endif // TFLITE_ENGINE_H
