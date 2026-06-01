package com.datalakevision;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;

@ReactModule(name = DatalakeVisionModule.NAME)
public class DatalakeVisionModule extends ReactContextBaseJavaModule {
    public static final String NAME = "DatalakeVision";

    // --- PRODUCTION NATIVE LOADER ---
    static {
        try {
            System.loadLibrary("datalake_engine");
            // Load the C++ JNI bridge which links against the Rust engine (.so)
            System.loadLibrary("datalake_vision_jni");
            com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry.addFrameProcessorPlugin("processDatalakeVision", (proxy, options) -> new DatalakeVisionFrameProcessorPlugin(proxy, options));
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public DatalakeVisionModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    @NonNull
    public String getName() {
        return NAME;
    }

    // --- Real JNI Bindings to Rust C FFI ---
    private native int datalake_vision_init();

    @ReactMethod
    public void initializeEngine(Promise promise) {
        try {
            // This calls the real Rust FFI via JNI to allocate the 40MB Arena and Thermal Governor
            int result = datalake_vision_init();
            if (result == 1) {
                promise.resolve(true);
            } else {
                promise.reject("INIT_ERROR", "Failed to initialize Rust memory arena. Result Code: " + result);
            }
        } catch (Exception e) {
            promise.reject("INIT_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void getPendingSyncCount(Promise promise) {
        // In a full implementation, this calls native Rust to query the CRDT ledger
        promise.resolve(0);
    }

    @ReactMethod
    public void generateSyncPayload(Promise promise) {
        // In a full implementation, this calls native Rust to generate the Ed25519 signed JSON
        promise.resolve("{}");
    }

    @ReactMethod
    public void verifyAndPurge(com.facebook.react.bridge.ReadableArray recordIds, String purgeToken, String serverPublicKey, Promise promise) {
        // In a full implementation, this calls native Rust to verify the AWS Lambda signature
        promise.resolve(true);
    }
}
