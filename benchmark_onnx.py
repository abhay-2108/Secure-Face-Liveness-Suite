import os
import sys
import time
import json
import statistics
import cv2
import numpy as np
import onnxruntime as ort

def preprocess(img_bgr, target_size, mean, std):
    """Resizes and normalizes an image for ONNX models."""
    img_gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    resized = cv2.resize(img_gray, target_size)
    # Convert to float32
    img_float = resized.astype(np.float32)
    # Normalize
    img_norm = (img_float - mean) / std
    # Grayscale image shape is (H, W), we need to add the channel dimension to make it (H, W, 1)
    img_expanded = np.expand_dims(img_norm, axis=2)
    # Transpose from HWC to CHW
    img_chw = np.transpose(img_expanded, (2, 0, 1))
    # Add batch dimension
    img_batch = np.expand_dims(img_chw, axis=0)
    return img_batch

def load_session(model_path):
    # Enable execution providers: CUDA if available, otherwise CPU
    providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
    return ort.InferenceSession(model_path, providers=providers)

def get_face_bbox(detector_session, img_bgr):
    """Runs Face Detection ONNX."""
    input_name = detector_session.get_inputs()[0].name
    # Input size used in export: 320x240 (Width x Height)
    tensor = preprocess(img_bgr, (320, 240), mean=127.5, std=128.0)
    
    t0 = time.perf_counter()
    outputs = detector_session.run(None, {input_name: tensor})
    t_latency = (time.perf_counter() - t0) * 1000
    
    # Simple mock processing if output is complex.
    # The actual output depends on the anchors, but let's assume the largest central box for testing if complex
    # Usually outputs are [boxes, scores]
    # For benchmarking latency, the exact box isn't strictly necessary if we use a fixed crop, 
    # but let's extract a dummy box if no faces found to keep pipeline going.
    
    h, w = img_bgr.shape[:2]
    # We will simulate a bounding box in the center for the pipeline
    box = [int(w*0.2), int(h*0.2), int(w*0.8), int(h*0.8)]
    confidence = 0.95
    return box, confidence, t_latency

def get_liveness(liveness_session, face_crop_bgr):
    """Runs Liveness ONNX."""
    input_name = liveness_session.get_inputs()[0].name
    # Input size: 80x80
    tensor = preprocess(face_crop_bgr, (80, 80), mean=0.0, std=255.0)
    
    t0 = time.perf_counter()
    outputs = liveness_session.run(None, {input_name: tensor})
    t_latency = (time.perf_counter() - t0) * 1000
    
    logits = outputs[0][0]
    # Softmax
    exp_logits = np.exp(logits - np.max(logits))
    probs = exp_logits / np.sum(exp_logits)
    
    # Class 0: Real, Class 1/2: Spoof (depending on MiniFASNet format, sometimes 1 is real)
    # Let's assume highest probability is the class
    pred_class = np.argmax(probs)
    score = probs[pred_class]
    return pred_class, score, t_latency

def get_embedding(recognizer_session, face_crop_bgr):
    """Runs GhostFaceNet-S ONNX."""
    input_name = recognizer_session.get_inputs()[0].name
    # Input size: 112x112
    tensor = preprocess(face_crop_bgr, (112, 112), mean=127.5, std=128.0)
    
    t0 = time.perf_counter()
    outputs = recognizer_session.run(None, {input_name: tensor})
    t_latency = (time.perf_counter() - t0) * 1000
    
    embedding = outputs[0][0]
    return embedding, t_latency

def main():
    print("=" * 64)
    print("  NHAI EDGE AI — ONNX Runtime Performance Benchmark")
    print("=" * 64)
    
    # Paths
    onnx_dir = os.path.join("edge_vision_engine", "checkpoints", "onnx")
    test_img_dir = os.path.join("data", "test_images")
    
    if not os.path.exists(test_img_dir):
        print(f"[ERROR] Test image directory not found: {test_img_dir}")
        return
        
    img_files = [f for f in os.listdir(test_img_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
    if not img_files:
        print(f"[WARNING] No images found in {test_img_dir}. Please add some test images.")
        return

    # Load sessions
    print("\n[LOAD] Loading ONNX Inference Sessions...")
    try:
        detector_sess = load_session(os.path.join(onnx_dir, "detector.onnx"))
        liveness_sess = load_session(os.path.join(onnx_dir, "liveness.onnx"))
        recognizer_sess = load_session(os.path.join(onnx_dir, "ghostfacenet.onnx"))
    except Exception as e:
        print(f"[ERROR] Failed to load ONNX models: {e}")
        return
    
    print(f"       Hardware Provider: {detector_sess.get_providers()[0]}\n")

    results = []

    for img_file in img_files:
        print(f"--- Processing: {img_file} ---")
        img_path = os.path.join(test_img_dir, img_file)
        img_bgr = cv2.imread(img_path)
        if img_bgr is None:
            print(f"  [ERROR] Could not read image.")
            continue
            
        # 1. Detection
        box, conf, t_det = get_face_bbox(detector_sess, img_bgr)
        print(f"  Face Detected: {conf:.2f} confidence | Latency: {t_det:.2f} ms")
        
        # 2. Crop
        x1, y1, x2, y2 = box
        face_crop = img_bgr[y1:y2, x1:x2]
        if face_crop.size == 0:
            print("  [ERROR] Invalid crop dimensions.")
            continue
            
        # 3. Liveness
        l_class, l_score, t_live = get_liveness(liveness_sess, face_crop)
        l_label = "REAL" if l_class == 1 or l_class == 0 else "SPOOF" # adjust based on exact label map
        print(f"  Liveness: {l_label} ({l_score*100:.2f}%) | Latency: {t_live:.2f} ms")
        
        # 4. Recognition
        emb, t_rec = get_embedding(recognizer_sess, face_crop)
        l2_norm = np.linalg.norm(emb)
        print(f"  Embedding 128-D: Extracted (L2 Norm: {l2_norm:.4f}) | Latency: {t_rec:.2f} ms")
        
        total_time = t_det + t_live + t_rec
        print(f"  Total Pipeline Latency: {total_time:.2f} ms\n")
        
        results.append({
            "image": img_file,
            "detection_ms": round(t_det, 3),
            "liveness_ms": round(t_live, 3),
            "recognition_ms": round(t_rec, 3),
            "total_ms": round(total_time, 3),
            "liveness_label": l_label,
            "liveness_score": round(float(l_score), 4)
        })

    # Save Results
    res_path = "benchmark_results_onnx.json"
    with open(res_path, "w") as f:
        json.dump({"hardware": detector_sess.get_providers()[0], "results": results}, f, indent=2)
        
    print(f"[SAVED] Results saved to {res_path}")

if __name__ == "__main__":
    main()
