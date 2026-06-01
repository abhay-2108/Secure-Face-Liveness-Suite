#include <jni.h>
#include <string>
#include <android/log.h>

#define LOG_TAG "DatalakeVisionJNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)

// Rust Engine FFI
extern "C" {
    int datalake_vision_init();
    char* datalake_vision_process_frame(uint8_t* yuv_data, int width, int height, int stride);
    void datalake_vision_free_string(char* s);
}

// 1. DatalakeVisionModule.datalake_vision_init()
extern "C" JNIEXPORT jint JNICALL
Java_com_datalakevision_DatalakeVisionModule_datalake_1vision_1init(JNIEnv* env, jobject /* thiz */) {
    LOGI("Calling Rust datalake_vision_init()");
    return datalake_vision_init();
}

// 2. DatalakeVisionFrameProcessorPlugin.nativeProcessFrame()
extern "C" JNIEXPORT jstring JNICALL
Java_com_datalakevision_DatalakeVisionFrameProcessorPlugin_nativeProcessFrame(
    JNIEnv* env, jobject /* thiz */, jint width, jint height, jint stride) {

    uint8_t* y_plane = new uint8_t[width * height];
    // Fill with synthetic gradient
    for (int i = 0; i < width * height; i++) {
        y_plane[i] = (uint8_t)(i % 255);
    }

    char* result_c_str = datalake_vision_process_frame(y_plane, width, height, stride);
    delete[] y_plane;

    if (result_c_str == nullptr) {
        return env->NewStringUTF("{\"face_detected\": false}");
    }
    
    jstring result = env->NewStringUTF(result_c_str);
    datalake_vision_free_string(result_c_str);
    return result;
}
