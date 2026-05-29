#include "VisionCameraJSIPlugin.h"
#include "VectorMath.h"
#include <iostream>
#include <sstream>

#if defined(__ANDROID__)
#include <jni.h>
// In Android, we access the JNI environment to unpack the direct memory pointers
// from the android.media.Image or AHardwareBuffer managed by Vision Camera.
extern "C" JNIEnv* GetJniEnv(); 
#elif defined(__APPLE__)
#include <CoreVideo/CoreVideo.h>
// In iOS, we unpack the AVFoundation CVPixelBufferRef structure
#endif

namespace NHAIEdgeAI {

using namespace facebook;

VisionCameraJSIPlugin::VisionCameraJSIPlugin()
    : m_tfliteEngine(std::make_unique<TFLiteEngine>()),
      m_clahePreprocessor(nullptr),
      m_opticalFlowValidator(std::make_unique<OpticalFlowValidator>(3, 3)),
      m_modelsInitialized(false) {}

void VisionCameraJSIPlugin::install(jsi::Runtime& runtime) {
    auto plugin = std::make_shared<VisionCameraJSIPlugin>();
    
    // Register the host object as a global property in JavaScript
    runtime.global().setProperty(
        runtime, 
        "__nhaiEdgeVisionEnginePlugin", 
        jsi::Object::createFromHostObject(runtime, plugin)
    );
}

jsi::Value VisionCameraJSIPlugin::get(jsi::Runtime& runtime, const jsi::PropNameID& name) {
    std::string propName = name.utf8(runtime);
    
    if (propName == "processFrame") {
        // Return the core frame processor function to JS
        return jsi::Function::createFromHostFunction(
            runtime,
            jsi::PropNameID::forAscii(runtime, "processFrame"),
            2, // Expects 2 arguments: frame and config
            [this](jsi::Runtime& rt, const jsi::Value& thisVal, const jsi::Value* args, size_t count) -> jsi::Value {
                return this->processFrame(rt, thisVal, args, count);
            }
        );
    }
    
    return jsi::Value::undefined();
}

jsi::Value VisionCameraJSIPlugin::processFrame(jsi::Runtime& runtime, const jsi::Value& thisValue, 
                                               const jsi::Value* arguments, size_t count) {
    // 1. Verify Arguments
    if (count < 2) {
        jsi::detail::throwJSError(runtime, "nhaiEdgeVisionEngine: Missing arguments (Expected: frame, config)");
        return jsi::Value::undefined();
    }

    if (!arguments[0].isObject() || !arguments[1].isObject()) {
        jsi::detail::throwJSError(runtime, "nhaiEdgeVisionEngine: Invalid argument types (Expected: Object, Object)");
        return jsi::Value::undefined();
    }

    jsi::Object frame = arguments[0].asObject(runtime);
    jsi::Object config = arguments[1].asObject(runtime);

    // 2. Unpack Config & Initialize Models (On-Demand Loading via mmap)
    float clipLimit = 2.0f;
    if (config.hasProperty(runtime, "clipLimit")) {
        clipLimit = static_cast<float>(config.getProperty(runtime, "clipLimit").asNumber());
    }

    if (!m_modelsInitialized) {
        std::string detectorPath = config.getProperty(runtime, "detectorPath").asString(runtime).utf8(runtime);
        std::string livenessPath = config.getProperty(runtime, "livenessPath").asString(runtime).utf8(runtime);
        std::string recognitionPath = config.getProperty(runtime, "recognitionPath").asString(runtime).utf8(runtime);

        // Load models using mmap (FlatBufferModel::BuildFromFile).
        // If loading fails, throw JS Exception
        if (!m_tfliteEngine->loadDetectorModel(detectorPath) ||
            !m_tfliteEngine->loadLivenessModel(livenessPath) ||
            !m_tfliteEngine->loadRecognitionModel(recognitionPath)) {
            jsi::detail::throwJSError(runtime, "nhaiEdgeVisionEngine: Failed to load TFLite models via mmap");
            return jsi::Value::undefined();
        }

        m_clahePreprocessor = std::make_unique<CLAHEPreprocessor>(clipLimit, 8, 8);
        m_opticalFlowValidator = std::make_unique<OpticalFlowValidator>(3, 3);
        m_modelsInitialized = true;
    }

    // 3. Extract Frame properties
    int width = static_cast<int>(frame.getProperty(runtime, "width").asNumber());
    int height = static_cast<int>(frame.getProperty(runtime, "height").asNumber());
    std::string pixelFormat = frame.getProperty(runtime, "pixelFormat").asString(runtime).utf8(runtime);

    // 4. Retrieve Native Pointer with ZERO-COPY
    // To bypass the bridge completely, react-native-vision-camera holds the native pointer to raw frame memory buffer.
    uint8_t* rawFrameDataPtr = nullptr;
    int rowStride = width;

#if defined(__ANDROID__)
    // Under Android, Vision Camera's JS 'Frame' object contains a native reference to HostObject holding the image.
    // In our C++ JSI code, we fetch the JNI reference to access direct memory bytes of android.media.Image.
    if (frame.hasProperty(runtime, "androidImagePointer")) {
        jlong imagePtrVal = static_cast<jlong>(frame.getProperty(runtime, "androidImagePointer").asNumber());
        rawFrameDataPtr = reinterpret_cast<uint8_t*>(imagePtrVal);
    }
    if (frame.hasProperty(runtime, "rowStride")) {
        rowStride = static_cast<int>(frame.getProperty(runtime, "rowStride").asNumber());
    }
#elif defined(__APPLE__)
    // Under iOS, we extract the core CVPixelBufferRef pointer directly from the Vision Camera Frame wrapper object
    if (frame.hasProperty(runtime, "cvPixelBufferPointer")) {
        void* pixelBufferRef = reinterpret_cast<void*>(static_cast<uintptr_t>(frame.getProperty(runtime, "cvPixelBufferPointer").asNumber()));
        CVPixelBufferRef pixelBuffer = (CVPixelBufferRef)pixelBufferRef;
        CVPixelBufferLockBaseAddress(pixelBuffer, kCVPixelBufferLock_ReadOnly);
        rawFrameDataPtr = (uint8_t*)CVPixelBufferGetBaseAddress(pixelBuffer);
        rowStride = CVPixelBufferGetBytesPerRow(pixelBuffer);
    }
#else
    // Fallback Mock Pointer for local C++ Testing environments
    if (frame.hasProperty(runtime, "mockPointer")) {
        jlong mockPtrVal = static_cast<jlong>(frame.getProperty(runtime, "mockPointer").asNumber());
        rawFrameDataPtr = reinterpret_cast<uint8_t*>(mockPtrVal);
    }
#endif

    if (rawFrameDataPtr == nullptr) {
        jsi::detail::throwJSError(runtime, "nhaiEdgeVisionEngine: Failed to acquire raw frame memory buffer pointer");
        return jsi::Value::undefined();
    }

    // 5. Execute High-Performance Pipeline
    bool preprocessSuccess = false;
    FaceDetectionResult faceResult;
    LivenessResult livenessResult;
    std::vector<float> currentEmbedding;
    float similarity = 0.0f;
    bool isMatch = false;

    // A. CLAHE Lighting Equalization (In-place processing)
    if (pixelFormat == "yuv" || pixelFormat == "nv21" || pixelFormat == "nv12") {
        // Equalize the Y (Luminance) channel only, saving up to 70% processing time
        preprocessSuccess = m_clahePreprocessor->processYUV420Frame(rawFrameDataPtr, width, height, rowStride);
        
        // B. Face Detection on Grayscale Luminance channel
        if (preprocessSuccess) {
            faceResult = m_tfliteEngine->runFaceDetection(rawFrameDataPtr, width, height, rowStride);
        }
    } else if (pixelFormat == "rgba" || pixelFormat == "rgb" || pixelFormat == "bgra") {
        // Equalize the RGB channels by converting to luminance, performing CLAHE, and blending back
        preprocessSuccess = m_clahePreprocessor->processRGBAInPlace(rawFrameDataPtr, width, height);

        // B. Face Detection (convert Y channel internally)
        if (preprocessSuccess) {
            // Extracts Y channel internally from RGBA and runs face detection
            faceResult = m_tfliteEngine->runFaceDetection(rawFrameDataPtr, width, height, rowStride);
        }
    }

#if defined(__APPLE__)
    // Safe unlock for Apple platforms
    if (frame.hasProperty(runtime, "cvPixelBufferPointer")) {
        void* pixelBufferRef = reinterpret_cast<void*>(static_cast<uintptr_t>(frame.getProperty(runtime, "cvPixelBufferPointer").asNumber()));
        CVPixelBufferUnlockBaseAddress((CVPixelBufferRef)pixelBufferRef, kCVPixelBufferLock_ReadOnly);
    }
#endif

    // C. Silent Liveness Verification on Face Crop
    bool activeLivenessPassed = false;
    ActiveLivenessResult activeLivenessRes;

    if (faceResult.faceDetected) {
        // Dynamically evaluate frame channel configuration
        int channels = (pixelFormat == "rgb") ? 3 : 4;
        int rIdx = (pixelFormat == "bgra") ? 2 : 0;
        int gIdx = 1;
        int bIdx = (pixelFormat == "bgra") ? 0 : 2;

        // RGB frame is used to evaluate surface reflections and depth cues (MiniFASNet)
        livenessResult = m_tfliteEngine->runLivenessCheck(rawFrameDataPtr, width, height, rowStride, channels, faceResult);
        
        // Active Liveness (Parallax Optical Flow) calculation using cached previous frame
        if (livenessResult.isReal) {
            int faceX = std::max(0, static_cast<int>(faceResult.xmin * width));
            int faceY = std::max(0, static_cast<int>(faceResult.ymin * height));
            int faceW = std::min(width - faceX, static_cast<int>((faceResult.xmax - faceResult.xmin) * width));
            int faceH = std::min(height - faceY, static_cast<int>((faceResult.ymax - faceResult.ymin) * height));

            // Extract the grayscale luminance channel from current frame (depends on YUV/RGBA source)
            const uint8_t* currLuminanceBuffer = nullptr;
            std::vector<uint8_t> rgbaLuminanceTmp;

            if (pixelFormat == "yuv" || pixelFormat == "nv21" || pixelFormat == "nv12") {
                currLuminanceBuffer = rawFrameDataPtr;
            } else {
                // For RGBA/BGRA/RGB, extract luminance in a temp buffer to run flow over
                rgbaLuminanceTmp.resize(width * height);
                for (int i = 0; i < width * height; ++i) {
                    int idx = i * channels;
                    uint8_t r = rawFrameDataPtr[idx + rIdx];
                    uint8_t g = rawFrameDataPtr[idx + gIdx];
                    uint8_t b = rawFrameDataPtr[idx + bIdx];
                    rgbaLuminanceTmp[i] = static_cast<uint8_t>((r * 77 + g * 150 + b * 29) >> 8);
                }
                currLuminanceBuffer = rgbaLuminanceTmp.data();
            }

            if (!m_prevFrameBuffer.empty() && m_prevWidth == width && m_prevHeight == height) {
                // Compute block matching dense grid optical flow parallax
                activeLivenessRes = m_opticalFlowValidator->validateParallax(
                    currLuminanceBuffer, m_prevFrameBuffer.data(), width, height, rowStride,
                    faceX, faceY, faceW, faceH
                );
                activeLivenessPassed = activeLivenessRes.passed;
            } else {
                // Bootstrapping phase (first frame or dimensions changed): prompt user to initialize motion
                activeLivenessPassed = false; 
                activeLivenessRes.details = "BOOTSTRAP_INITIALIZING";
            }

            // Cache the current luminance buffer in static recycle memory for the next loop
            if (m_prevFrameBuffer.size() != static_cast<size_t>(rowStride * height)) {
                m_prevFrameBuffer.resize(rowStride * height);
            }
            std::memcpy(m_prevFrameBuffer.data(), currLuminanceBuffer, rowStride * height);
            m_prevWidth = width;
            m_prevHeight = height;
        }

        // D. Face Recognition (GhostFaceNet-S Embedding Extraction)
        if (livenessResult.isReal && activeLivenessPassed) {
            currentEmbedding = m_tfliteEngine->runFaceRecognition(rawFrameDataPtr, width, height, rowStride, channels, faceResult);
            
            // E. Cosine Similarity Match against Reference Identity
            if (!currentEmbedding.empty() && config.hasProperty(runtime, "referenceEmbedding")) {
                jsi::Array refArray = config.getProperty(runtime, "referenceEmbedding").asObject(runtime).asArray(runtime);
                size_t refLen = refArray.size(runtime);
                std::vector<float> refEmbedding(refLen);
                for (size_t i = 0; i < refLen; ++i) {
                    refEmbedding[i] = static_cast<float>(refArray.getValueAtIndex(runtime, i).asNumber());
                }

                similarity = VectorMath::calculateCosineSimilarity(currentEmbedding, refEmbedding);
                
                // Demographic matching threshold: 0.85 (High accuracy)
                float threshold = 0.85f;
                if (config.hasProperty(runtime, "matchThreshold")) {
                    threshold = static_cast<float>(config.getProperty(runtime, "matchThreshold").asNumber());
                }
                isMatch = (similarity >= threshold);
            }
        }
    }

    // 6. Return Structured Primitives to JavaScript (Bridge-overhead is eliminated!)
    jsi::Object result(runtime);
    result.setProperty(runtime, "success", true);
    result.setProperty(runtime, "faceDetected", faceResult.faceDetected);
    result.setProperty(runtime, "faceConfidence", faceResult.confidence);
    
    if (faceResult.faceDetected) {
        result.setProperty(runtime, "isLive", livenessResult.isReal && activeLivenessPassed);
        result.setProperty(runtime, "passiveLivenessReal", livenessResult.isReal);
        result.setProperty(runtime, "passiveLivenessScore", livenessResult.livenessScore);
        result.setProperty(runtime, "activeLivenessPassed", activeLivenessPassed);
        result.setProperty(runtime, "activeLivenessVariance", activeLivenessRes.variance);
        result.setProperty(runtime, "activeLivenessRatio", activeLivenessRes.parallaxRatio);
        result.setProperty(runtime, "activeLivenessDetails", jsi::String::createFromUtf8(runtime, activeLivenessRes.details));
        
        if (livenessResult.isReal && activeLivenessPassed) {
            result.setProperty(runtime, "embeddingExtracted", !currentEmbedding.empty());
            if (!currentEmbedding.empty() && config.hasProperty(runtime, "referenceEmbedding")) {
                result.setProperty(runtime, "similarityScore", similarity);
                result.setProperty(runtime, "isMatch", isMatch);
            }
        } else {
            result.setProperty(runtime, "embeddingExtracted", false);
            if (!livenessResult.isReal) {
                result.setProperty(runtime, "status", jsi::String::createFromUtf8(runtime, "PASSIVE_SPOOF_ATTACK_DETECTED"));
            } else {
                result.setProperty(runtime, "status", jsi::String::createFromUtf8(runtime, activeLivenessRes.details));
            }
        }
    } else {
        result.setProperty(runtime, "isLive", false);
        result.setProperty(runtime, "activeLivenessPassed", false);
        result.setProperty(runtime, "embeddingExtracted", false);
        result.setProperty(runtime, "status", jsi::String::createFromUtf8(runtime, "NO_FACE_DETECTED"));
    }

    return jsi::Value(runtime, result);
}

} // namespace NHAIEdgeAI
