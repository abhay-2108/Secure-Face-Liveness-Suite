/**
 * JNI Bridge: datalake_vision_jni.cpp
 *
 * Thin C++ layer between the Java NativeModule and the Rust engine.
 * Each JNI function converts jstring arguments to const char*,
 * calls the corresponding Rust extern "C" function, and returns
 * the result string back to Java.
 *
 * The Rust engine exposes a flat C API (no C++ name mangling):
 *   - datalake_engine_initialize(const char* config_json) -> const char*
 *   - datalake_engine_search(const char* embedding_json) -> const char*
 *   - datalake_engine_enroll(const char* label, const char* embedding_json) -> const char*
 *   - datalake_engine_sync_status() -> const char*
 *   - datalake_engine_purge() -> const char*
 *   - datalake_engine_metrics() -> const char*
 *   - datalake_engine_trigger_sync() -> const char*
 *   - datalake_engine_shutdown() -> void
 *   - datalake_engine_free_string(const char*) -> void
 */

#include <jni.h>
#include <string>
#include <android/log.h>

#define LOG_TAG "DatalakeVisionJNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

// ─── Rust Engine FFI Declarations ─────────────────────────────────────────────
// These are the extern "C" functions exported by libdatalake_engine.so
// Built with cargo-ndk from the Rust workspace.

extern "C" {
    const char* datalake_engine_initialize(const char* config_json);
    const char* datalake_engine_search(const char* embedding_json);
    const char* datalake_engine_enroll(const char* label, const char* embedding_json);
    const char* datalake_engine_sync_status();
    const char* datalake_engine_purge();
    const char* datalake_engine_metrics();
    const char* datalake_engine_trigger_sync();
    void datalake_engine_shutdown();
    void datalake_engine_free_string(const char* s);
}

/**
 * Helper: call a Rust function that returns a C string,
 * convert it to a Java string, and free the Rust allocation.
 */
static jstring rustStringToJava(JNIEnv* env, const char* rustResult) {
    if (rustResult == nullptr) {
        return env->NewStringUTF("{\"error\":\"null response from engine\"}");
    }
    jstring javaResult = env->NewStringUTF(rustResult);
    datalake_engine_free_string(rustResult);
    return javaResult;
}

// ─── JNI Method Implementations ─────────────────────────────────────────────

extern "C" JNIEXPORT jstring JNICALL
Java_com_datalakevision_DatalakeVisionModule_nativeInitialize(
    JNIEnv* env, jclass /* clazz */, jstring configJson) {

    const char* config = env->GetStringUTFChars(configJson, nullptr);
    LOGI("Initializing engine with config length: %zu", strlen(config));

    const char* result = datalake_engine_initialize(config);
    env->ReleaseStringUTFChars(configJson, config);

    return rustStringToJava(env, result);
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_datalakevision_DatalakeVisionModule_nativeSearchIdentity(
    JNIEnv* env, jclass /* clazz */, jstring embeddingJson) {

    const char* embedding = env->GetStringUTFChars(embeddingJson, nullptr);
    const char* result = datalake_engine_search(embedding);
    env->ReleaseStringUTFChars(embeddingJson, embedding);

    return rustStringToJava(env, result);
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_datalakevision_DatalakeVisionModule_nativeEnrollIdentity(
    JNIEnv* env, jclass /* clazz */, jstring label, jstring embeddingJson) {

    const char* labelStr = env->GetStringUTFChars(label, nullptr);
    const char* embedding = env->GetStringUTFChars(embeddingJson, nullptr);

    const char* result = datalake_engine_enroll(labelStr, embedding);

    env->ReleaseStringUTFChars(label, labelStr);
    env->ReleaseStringUTFChars(embeddingJson, embedding);

    return rustStringToJava(env, result);
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_datalakevision_DatalakeVisionModule_nativeGetSyncStatus(
    JNIEnv* env, jclass /* clazz */) {

    const char* result = datalake_engine_sync_status();
    return rustStringToJava(env, result);
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_datalakevision_DatalakeVisionModule_nativeForcePurge(
    JNIEnv* env, jclass /* clazz */) {

    const char* result = datalake_engine_purge();
    return rustStringToJava(env, result);
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_datalakevision_DatalakeVisionModule_nativeGetMetrics(
    JNIEnv* env, jclass /* clazz */) {

    const char* result = datalake_engine_metrics();
    return rustStringToJava(env, result);
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_datalakevision_DatalakeVisionModule_nativeTriggerSync(
    JNIEnv* env, jclass /* clazz */) {

    const char* result = datalake_engine_trigger_sync();
    return rustStringToJava(env, result);
}

extern "C" JNIEXPORT void JNICALL
Java_com_datalakevision_DatalakeVisionModule_nativeShutdown(
    JNIEnv* /* env */, jclass /* clazz */) {

    LOGI("Shutting down engine");
    datalake_engine_shutdown();
}
