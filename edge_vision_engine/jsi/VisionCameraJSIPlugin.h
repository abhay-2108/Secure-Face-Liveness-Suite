#ifndef VISION_CAMERA_JSI_PLUGIN_H
#define VISION_CAMERA_JSI_PLUGIN_H

#include <jsi/jsi.h>
#include <memory>
#include <vector>
#include "TFLiteEngine.h"
#include "../preprocessing/clahe_preprocessor.h"
#include "../preprocessing/optical_flow.h"

namespace NHAIEdgeAI {

using namespace facebook;

/**
 * Custom JSI HostObject representing the NHAI Edge AI Engine.
 * Registers the high-performance frame processor inside the JavaScript global namespace.
 */
class VisionCameraJSIPlugin : public jsi::HostObject {
public:
    VisionCameraJSIPlugin();
    virtual ~VisionCameraJSIPlugin() = default;

    /**
     * Exposes properties and methods to JavaScript.
     * Overrides HostObject get() to define '__nhaiEdgeVisionEngine' method.
     */
    virtual jsi::Value get(jsi::Runtime& runtime, const jsi::PropNameID& name) override;

    /**
     * Installs the JSI plugin by registering it in the JSI Global Runtime context.
     * Can be invoked from the Native Module initializer (Android JNI / iOS AppDelegate).
     */
    static void install(jsi::Runtime& runtime);

private:
    std::unique_ptr<TFLiteEngine> m_tfliteEngine;
    std::unique_ptr<CLAHEPreprocessor> m_clahePreprocessor;
    std::unique_ptr<OpticalFlowValidator> m_opticalFlowValidator;
    bool m_modelsInitialized = false;

    // Temporal frame buffer caching for Active Liveness (Optical Flow Parallax Validation)
    std::vector<uint8_t> m_prevFrameBuffer;
    int m_prevWidth = 0;
    int m_prevHeight = 0;

    /**
     * The core native frame processor JSI function.
     * Bypasses the asynchronous React Native bridge completely.
     * 
     * Signature: __nhaiEdgeVisionEngine(frame: Frame, config: {
     *   detectorPath: string,
     *   livenessPath: string,
     *   recognitionPath: string,
     *   referenceEmbedding?: number[],
     *   clipLimit?: number
     * }) -> ResultObject
     */
    jsi::Value processFrame(jsi::Runtime& runtime, const jsi::Value& thisValue, 
                            const jsi::Value* arguments, size_t count);
};

} // namespace NHAIEdgeAI

#endif // VISION_CAMERA_JSI_PLUGIN_H
