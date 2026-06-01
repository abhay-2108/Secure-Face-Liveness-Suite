package com.datalakevision;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.mrousavy.camera.frameprocessors.Frame;
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin;
import java.util.Map;

public class DatalakeVisionFrameProcessorPlugin extends FrameProcessorPlugin {

    // Declare the native JNI method defined in datalake_vision_jni.cpp
    private native String nativeProcessFrame(int width, int height, int stride);

    public DatalakeVisionFrameProcessorPlugin(com.mrousavy.camera.frameprocessors.VisionCameraProxy proxy, @Nullable Map<String, Object> options) {
        super();
    }

    @Nullable
    @Override
    public Object callback(@NonNull Frame frame, @Nullable Map<String, Object> arguments) {
        try {
            // Call the JNI method bridging to the Rust engine
            return nativeProcessFrame(frame.getWidth(), frame.getHeight(), frame.getWidth());
        } catch (com.mrousavy.camera.core.FrameInvalidError e) {
            return "{\"face_detected\": false, \"error\": \"FrameInvalidError\"}";
        }
    }
}
