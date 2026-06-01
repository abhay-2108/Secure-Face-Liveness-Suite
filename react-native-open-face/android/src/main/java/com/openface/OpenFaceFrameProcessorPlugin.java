package com.OpenFace;

import android.media.Image;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.mrousavy.camera.frameprocessors.Frame;
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin;
import java.nio.ByteBuffer;
import java.util.Map;

/**
 * VisionCamera Frame Processor Plugin for OpenFace.
 *
 * Extracts the Y-plane (luminance) from the camera frame as a DirectByteBuffer
 * and passes it to the Rust engine via JNI for zero-copy processing.
 *
 * Registration happens in OpenFaceModule's static initializer via
 * FrameProcessorPluginRegistry.addFrameProcessorPlugin().
 */
public class OpenFaceFrameProcessorPlugin extends FrameProcessorPlugin {

    /**
     * JNI method that accepts a DirectByteBuffer pointing to the Y-plane
     * of the camera frame, along with frame dimensions.
     *
     * The C++ side uses GetDirectBufferAddress to get a raw pointer
     * and passes it directly to the Rust engine — no copy needed.
     */
    private native String nativeProcessFrame(
        ByteBuffer yPlaneBuffer,
        int width,
        int height,
        int stride
    );

    public OpenFaceFrameProcessorPlugin(
        com.mrousavy.camera.frameprocessors.VisionCameraProxy proxy,
        @Nullable Map<String, Object> options
    ) {
        super();
    }

    @Nullable
    @Override
    public Object callback(@NonNull Frame frame, @Nullable Map<String, Object> arguments) {
        try {
            Image image = frame.getImage();
            if (image == null) {
                return "{\"faceDetected\": false, \"error\": \"Null Image\"}";
            }

            Image.Plane[] planes = image.getPlanes();
            if (planes.length == 0) {
                return "{\"faceDetected\": false, \"error\": \"No image planes\"}";
            }

            // Extract the Y-plane (luminance channel) — this is a DirectByteBuffer
            // backed by the hardware camera's memory, so passing it to JNI is zero-copy.
            ByteBuffer yBuffer = planes[0].getBuffer();
            int width = image.getWidth();
            int height = image.getHeight();
            int stride = planes[0].getRowStride();

            // Pass the direct buffer to JNI → C++ → Rust
            return nativeProcessFrame(yBuffer, width, height, stride);

        } catch (Exception e) {
            return "{\"faceDetected\": false, \"error\": \"" + e.getMessage() + "\"}";
        }
    }
}
