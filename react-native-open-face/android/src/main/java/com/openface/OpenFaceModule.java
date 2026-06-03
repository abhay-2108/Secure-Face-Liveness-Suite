package com.OpenFace;

import android.content.res.AssetManager;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;

/**
 * React Native native module bridging JavaScript to the Rust engine via JNI.
 *
 * Method signatures match the TypeScript spec in NativeOpenFace.ts:
 *   initialize(configJson) → Promise<string>
 *   searchIdentity(embeddingJson) → Promise<string>
 *   enrollIdentity(label, embeddingJson) → Promise<string>
 *   getSyncStatus() → Promise<string>
 *   getMetrics() → Promise<string>
 *   forcePurge() → Promise<string>
 *   triggerSync() → Promise<void>
 *   shutdown() → Promise<void>
 */
@ReactModule(name = OpenFaceModule.NAME)
public class OpenFaceModule extends ReactContextBaseJavaModule {
    public static final String NAME = "OpenFace";

    // Load the Rust engine and JNI bridge native libraries
    static {
        try {
            System.loadLibrary("open_face_engine");
            System.loadLibrary("open_face_jni");
            // Register the VisionCamera frame processor plugin
            com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry
                .addFrameProcessorPlugin("processOpenFace",
                    (proxy, options) -> new OpenFaceFrameProcessorPlugin(proxy, options));
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    // --- JNI native method declarations ---
    private native int    nativeInit();
    private native String nativeInitialize(String configJson);
    private native String nativeSearchIdentity(String embeddingJson);
    private native String nativeEnrollIdentity(String label, String embeddingJson);
    private native String nativeGetSyncStatus();
    private native String nativeGetMetrics();
    private native String nativeForcePurge();
    private native void   nativeTriggerSync();
    private native void   nativeShutdown();
    private native int    nativeLoadModels(AssetManager assetManager);

    public OpenFaceModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    @NonNull
    public String getName() {
        return NAME;
    }

    @ReactMethod
    public void loadModels(String customOtaPath, Promise promise) {
        new Thread(() -> {
            try {
                // Load ONNX models from APK assets via zero-copy AAssetManager
                AssetManager assetManager = getReactApplicationContext().getAssets();
                int result = nativeLoadModels(assetManager);
                if (result == 1) {
                    promise.resolve(true);
                } else {
                    // Models not found in assets — engine still works in heuristic mode
                    android.util.Log.w(NAME, "ONNX models not found in assets. Falling back to heuristic mode.");
                    promise.resolve(true);
                }
            } catch (Exception e) {
                promise.reject("MODEL_LOAD_ERROR", e);
            }
        }).start();
    }

    /**
     * Initialize the engine with a JSON configuration.
     * Also attempts to load ONNX models from APK assets via zero-copy mmap.
     */
    @ReactMethod
    public void initialize(String configJson, Promise promise) {
        try {
            String result = nativeInitialize(configJson);

            // Attempt zero-copy model loading from APK assets
            AssetManager assetManager = getReactApplicationContext().getAssets();
            int modelResult = nativeLoadModels(assetManager);
            if (modelResult != 1) {
                // Models not found in assets — this is expected if models
                // haven't been bundled yet. Engine still works for liveness.
                android.util.Log.w(NAME, "ONNX models not found in assets. " +
                    "Inference will fall back to heuristic mode.");
            }

            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("INIT_ERROR", e.getMessage());
        }
    }

    /**
     * Search the HNSW vector index for a matching identity.
     */
    @ReactMethod
    public void searchIdentity(String embeddingJson, Promise promise) {
        try {
            String result = nativeSearchIdentity(embeddingJson);
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("SEARCH_ERROR", e.getMessage());
        }
    }

    /**
     * Enroll a new identity into the local HNSW index and encrypted ledger.
     */
    @ReactMethod
    public void enrollIdentity(String label, String embeddingJson, Promise promise) {
        try {
            String result = nativeEnrollIdentity(label, embeddingJson);
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("ENROLL_ERROR", e.getMessage());
        }
    }

    /**
     * Get the current sync status of the local ledger.
     */
    @ReactMethod
    public void getSyncStatus(Promise promise) {
        try {
            String result = nativeGetSyncStatus();
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("SYNC_STATUS_ERROR", e.getMessage());
        }
    }

    /**
     * Get current engine performance metrics.
     */
    @ReactMethod
    public void getMetrics(Promise promise) {
        try {
            String result = nativeGetMetrics();
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("METRICS_ERROR", e.getMessage());
        }
    }

    /**
     * Force purge the local ledger of all synced records.
     */
    @ReactMethod
    public void forcePurge(Promise promise) {
        try {
            String result = nativeForcePurge();
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("PURGE_ERROR", e.getMessage());
        }
    }

    /**
     * Trigger a manual sync with the remote OpenFace.
     */
    @ReactMethod
    public void triggerSync(Promise promise) {
        try {
            nativeTriggerSync();
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("SYNC_ERROR", e.getMessage());
        }
    }

    /**
     * Shutdown the engine and release all native resources.
     */
    @ReactMethod
    public void shutdown(Promise promise) {
        try {
            nativeShutdown();
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("SHUTDOWN_ERROR", e.getMessage());
        }
    }

    // =========================================================================
    // Legacy methods kept for backward compatibility with the hook's sync loop
    // =========================================================================

    @ReactMethod
    public void initializeEngine(Promise promise) {
        try {
            int result = nativeInit();
            if (result == 1) {
                // Also try loading models
                AssetManager assetManager = getReactApplicationContext().getAssets();
                nativeLoadModels(assetManager);
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
        try {
            String syncStatus = nativeGetSyncStatus();
            // Extract pendingCount from JSON — simple parse
            // Format: {"pendingCount":N,...}
            int start = syncStatus.indexOf("\"pendingCount\":") + 15;
            int end = syncStatus.indexOf(",", start);
            if (start > 14 && end > start) {
                int count = Integer.parseInt(syncStatus.substring(start, end));
                promise.resolve(count);
            } else {
                promise.resolve(0);
            }
        } catch (Exception e) {
            promise.resolve(0);
        }
    }
}
