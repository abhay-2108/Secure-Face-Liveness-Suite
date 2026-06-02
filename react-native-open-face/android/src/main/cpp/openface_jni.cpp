#include <jni.h>
#include <string>
#include <android/log.h>
#include <android/asset_manager.h>
#include <android/asset_manager_jni.h>
#include "libyuv.h"
#include <vector>

#define LOG_TAG "OpenFaceJNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

// ============================================================================
// Frame Resizing (High-Quality Bilinear)
// ============================================================================
void resizeFrameBilinear(
    const uint8_t* src_y, int src_stride_y,
    const uint8_t* src_uv, int src_stride_uv,
    int src_width, int src_height,
    uint8_t* dst_y, int dst_stride_y,
    uint8_t* dst_uv, int dst_stride_uv,
    int dst_width, int dst_height
) {
    // libyuv NV21 scale implementation with high-quality bilinear filtering
    libyuv::NV12Scale(
        src_y, src_stride_y,
        src_uv, src_stride_uv,
        src_width, src_height,
        dst_y, dst_stride_y,
        dst_uv, dst_stride_uv,
        dst_width, dst_height,
        libyuv::kFilterBilinear // CRITICAL: Maintains Liveness accuracy
    );
}
// Rust Engine FFI declarations — must match extern "C" exports in lib.rs
// ============================================================================
extern "C" {
    // Legacy init (backward compat)
    int open_face_init();

    // New comprehensive API
    char* open_face_initialize(const char* config_json);
    char* open_face_search_identity(const char* embedding_json);
    char* open_face_enroll_identity(const char* label, const char* embedding_json);
    char* open_face_get_sync_status();
    char* open_face_get_metrics();
    char* open_face_force_purge();
    void  open_face_trigger_sync();
    void  open_face_shutdown();

    // Frame processing
    char* open_face_process_frame(uint8_t* yuv_data, int width, int height, int stride, int flash_state);
    void  open_face_free_string(char* s);

    // Model loading (Android zero-copy via AAssetManager)
    int open_face_load_model_zero_copy(JNIEnv* env, jobject asset_manager);
}

// ============================================================================
// Helper: Call a Rust FFI function that returns a char*, convert to jstring
// ============================================================================
static jstring rustStringToJString(JNIEnv* env, char* rust_str) {
    if (rust_str == nullptr) {
        return env->NewStringUTF("{\"success\":false,\"error\":\"Null result from engine\"}");
    }
    jstring result = env->NewStringUTF(rust_str);
    open_face_free_string(rust_str);
    return result;
}

// ============================================================================
// OpenFaceModule JNI bindings
// ============================================================================

// Legacy: open_face_init() → int
extern "C" JNIEXPORT jint JNICALL
Java_com_openface_OpenFaceModule_nativeInit(JNIEnv* env, jobject /* thiz */) {
    LOGI("Calling Rust open_face_init()");
    return open_face_init();
}

// initialize(configJson: String): String
extern "C" JNIEXPORT jstring JNICALL
Java_com_openface_OpenFaceModule_nativeInitialize(
    JNIEnv* env, jobject /* thiz */, jstring configJson) {
    const char* config = env->GetStringUTFChars(configJson, nullptr);
    LOGI("Calling open_face_initialize with config");
    char* result = open_face_initialize(config);
    env->ReleaseStringUTFChars(configJson, config);
    return rustStringToJString(env, result);
}

// searchIdentity(embeddingJson: String): String
extern "C" JNIEXPORT jstring JNICALL
Java_com_openface_OpenFaceModule_nativeSearchIdentity(
    JNIEnv* env, jobject /* thiz */, jstring embeddingJson) {
    const char* embedding = env->GetStringUTFChars(embeddingJson, nullptr);
    char* result = open_face_search_identity(embedding);
    env->ReleaseStringUTFChars(embeddingJson, embedding);
    return rustStringToJString(env, result);
}

// enrollIdentity(label: String, embeddingJson: String): String
extern "C" JNIEXPORT jstring JNICALL
Java_com_openface_OpenFaceModule_nativeEnrollIdentity(
    JNIEnv* env, jobject /* thiz */, jstring label, jstring embeddingJson) {
    const char* labelStr = env->GetStringUTFChars(label, nullptr);
    const char* embedding = env->GetStringUTFChars(embeddingJson, nullptr);
    char* result = open_face_enroll_identity(labelStr, embedding);
    env->ReleaseStringUTFChars(label, labelStr);
    env->ReleaseStringUTFChars(embeddingJson, embedding);
    return rustStringToJString(env, result);
}

// getSyncStatus(): String
extern "C" JNIEXPORT jstring JNICALL
Java_com_openface_OpenFaceModule_nativeGetSyncStatus(
    JNIEnv* env, jobject /* thiz */) {
    char* result = open_face_get_sync_status();
    return rustStringToJString(env, result);
}

// getMetrics(): String
extern "C" JNIEXPORT jstring JNICALL
Java_com_openface_OpenFaceModule_nativeGetMetrics(
    JNIEnv* env, jobject /* thiz */) {
    char* result = open_face_get_metrics();
    return rustStringToJString(env, result);
}

// forcePurge(): String
extern "C" JNIEXPORT jstring JNICALL
Java_com_openface_OpenFaceModule_nativeForcePurge(
    JNIEnv* env, jobject /* thiz */) {
    char* result = open_face_force_purge();
    return rustStringToJString(env, result);
}

// triggerSync(): void
extern "C" JNIEXPORT void JNICALL
Java_com_openface_OpenFaceModule_nativeTriggerSync(
    JNIEnv* env, jobject /* thiz */) {
    open_face_trigger_sync();
}

// shutdown(): void
extern "C" JNIEXPORT void JNICALL
Java_com_openface_OpenFaceModule_nativeShutdown(
    JNIEnv* env, jobject /* thiz */) {
    LOGI("Shutting down Rust engine");
    open_face_shutdown();
}

// loadModels(AssetManager): int
extern "C" JNIEXPORT jint JNICALL
Java_com_openface_OpenFaceModule_nativeLoadModels(
    JNIEnv* env, jobject /* thiz */, jobject assetManager) {
    LOGI("Loading ONNX models via zero-copy AAssetManager");
    return open_face_load_model_zero_copy(env, assetManager);
}

// ============================================================================
// OpenFaceFrameProcessorPlugin JNI binding
// ============================================================================
extern "C" JNIEXPORT jstring JNICALL
Java_com_openface_OpenFaceFrameProcessorPlugin_nativeProcessFrame(
    JNIEnv* env, jobject /* thiz */,
    jobject directBuffer, jint width, jint height, jint stride, jint flashState) {

    uint8_t* y_plane = nullptr;

    if (directBuffer != nullptr) {
        // Zero-copy: get the direct buffer address from Java's ByteBuffer
        y_plane = static_cast<uint8_t*>(env->GetDirectBufferAddress(directBuffer));
    }

    if (y_plane == nullptr) {
        LOGE("Failed to get direct buffer address — falling back to synthetic data");
        // Fallback: allocate synthetic buffer for emulator/testing
        y_plane = new uint8_t[width * height];
        for (int i = 0; i < width * height; i++) {
            y_plane[i] = (uint8_t)(i % 255);
        }

        char* result_c_str = open_face_process_frame(y_plane, width, height, stride, flashState);
        delete[] y_plane;

        return rustStringToJString(env, result_c_str);
    }

    // Zero-copy path: pass the hardware camera buffer pointer directly to Rust
    char* result_c_str = open_face_process_frame(y_plane, width, height, stride, flashState);
    return rustStringToJString(env, result_c_str);
}
