"""
pipeline.py — NHAI Edge AI Pipeline Utility
============================================
Single entry-point for:
  1. Syncing all model weights from Hugging Face Hub (raj0120/edge-face-pipeline)
  2. Running full end-to-end integration validation of all three AI models

Usage:
    # Sync weights only (no inference)
    python pipeline.py --sync

    # Validate full pipeline (syncs automatically if weights missing)
    python pipeline.py --validate

    # Both sync + validate
    python pipeline.py --sync --validate

    # Upload ONNX models to Hugging Face
    python pipeline.py --upload
"""

import os
import sys
import time
import argparse
import torch

# Adjust Python path so models can be imported from the engine directory
sys.path.append(os.path.join(os.path.dirname(__file__), "edge_vision_engine", "models"))

HF_REPO_ID    = "raj0120/edge-face-pipeline"
CHECKPOINT_DIR = "edge_vision_engine/checkpoints"
WEIGHTS_DIR    = "edge_vision_engine/models/weights"

# All weights hosted on Hugging Face Hub — (hf_filename, local_path)
MODEL_REGISTRY = [
    ("ghostfacenet_epoch_3.pt",      os.path.join(CHECKPOINT_DIR, "ghostfacenet_epoch_3.pt")),
    ("linzaer_version_rfb_320.pth",  os.path.join(WEIGHTS_DIR,    "linzaer_version_rfb_320.pth")),
    ("mini_fas_net_v1se.pth",        os.path.join(WEIGHTS_DIR,    "mini_fas_net_v1se.pth")),
]


# ──────────────────────────────────────────────────────────────────────────────
# Weight Synchronization
# ──────────────────────────────────────────────────────────────────────────────

def _download_file(filename: str, local_path: str):
    """Downloads a single file from Hugging Face Hub into the expected local path."""
    if os.path.exists(local_path):
        print(f"  [CACHED]  {filename}")
        return
    print(f"  [FETCH]   {filename}  →  downloading from Hub ({HF_REPO_ID})...")
    try:
        from huggingface_hub import hf_hub_download
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        downloaded = hf_hub_download(
            repo_id=HF_REPO_ID,
            filename=filename,
            local_dir=os.path.dirname(local_path),
        )
        if os.path.exists(downloaded) and os.path.abspath(downloaded) != os.path.abspath(local_path):
            os.replace(downloaded, local_path)
        print(f"  [SUCCESS] {filename}  ({os.path.getsize(local_path) / 1024:.1f} KB)")
    except Exception as e:
        print(f"  [ERROR]   Could not fetch '{filename}' from Hub: {e}")
        sys.exit(1)


def sync_weights():
    """Ensures all model weights are present locally, fetching from Hub if needed."""
    print("\n" + "="*60)
    print("  NHAI EDGE AI — Weight Synchronization")
    print(f"  Hub: https://huggingface.co/{HF_REPO_ID}")
    print("="*60)
    for filename, local_path in MODEL_REGISTRY:
        _download_file(filename, local_path)
    print("\n  All weights synchronized.\n")


# ──────────────────────────────────────────────────────────────────────────────
# Model Upload (ONNX)
# ──────────────────────────────────────────────────────────────────────────────

def upload_models():
    """Uploads ONNX models to Hugging Face Hub."""
    from huggingface_hub import HfApi
    from dotenv import load_dotenv
    load_dotenv()
    
    HF_TOKEN = os.getenv("HF_TOKEN")
    ONNX_DIR = "models_onnx"
    
    if not HF_TOKEN:
        print("Error: HF_TOKEN not found in .env file.")
        return

    print(f"\n" + "="*60)
    print("  NHAI EDGE AI — Uploading Models")
    print(f"  Hub: https://huggingface.co/{HF_REPO_ID}")
    print("="*60)
    
    try:
        api = HfApi()
        # Create repo if it doesn't exist
        api.create_repo(repo_id=HF_REPO_ID, token=HF_TOKEN, exist_ok=True, private=False)
        
        if not os.path.exists(ONNX_DIR):
            print(f"Error: Directory {ONNX_DIR} does not exist.")
            return

        # Upload all files in the onnx directory
        for filename in os.listdir(ONNX_DIR):
            file_path = os.path.join(ONNX_DIR, filename)
            if os.path.isfile(file_path):
                print(f"  [UPLOAD]  {filename}...")
                api.upload_file(
                    path_or_fileobj=file_path,
                    path_in_repo=filename,
                    repo_id=HF_REPO_ID,
                    repo_type="model",
                    token=HF_TOKEN
                )
        print("\n  All models uploaded successfully!\n")
    except Exception as e:
        print(f"  [ERROR]   Failed to upload models: {e}")


# ──────────────────────────────────────────────────────────────────────────────
# End-to-End Pipeline Validation
# ──────────────────────────────────────────────────────────────────────────────

def validate_pipeline():
    """Loads all three models and runs a timed mock inference to verify integration."""
    from detector import LinzaerDetectorRFB
    from liveness import MiniFASNetV1SE
    from ghostfacenet import GhostFaceNetS

    print("\n" + "="*60)
    print("  NHAI EDGE AI — Pipeline Integration Validation")
    print("="*60)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"  [DEVICE]  {device.type.upper()}\n")

    # ── Step 1: Face Detector ─────────────────────────────────────────────────
    print("[STEP 1] Linzaer Ultra-Light Face Detector")
    detector_path = os.path.join(WEIGHTS_DIR, "linzaer_version_rfb_320.pth")
    _download_file("linzaer_version_rfb_320.pth", detector_path)
    detector = LinzaerDetectorRFB().to(device)
    detector.load_state_dict(torch.load(detector_path, map_location=device, weights_only=True))
    detector.eval()
    print(f"  [READY]   {detector_path}")

    # ── Step 2: Passive Liveness (Mini-FAS-Net) ───────────────────────────────
    print("\n[STEP 2] Mini-FAS-Net Passive Anti-Spoofing Liveness Model")
    liveness_path = os.path.join(WEIGHTS_DIR, "mini_fas_net_v1se.pth")
    _download_file("mini_fas_net_v1se.pth", liveness_path)
    liveness = MiniFASNetV1SE().to(device)
    liveness.load_state_dict(torch.load(liveness_path, map_location=device, weights_only=True))
    liveness.eval()
    print(f"  [READY]   {liveness_path}")

    # ── Step 3: Fine-Tuned GhostFaceNet-S ────────────────────────────────────
    print("\n[STEP 3] Fine-Tuned GhostFaceNet-S Face Recognizer")
    recognizer_path = os.path.join(CHECKPOINT_DIR, "ghostfacenet_epoch_3.pt")
    _download_file("ghostfacenet_epoch_3.pt", recognizer_path)
    recognizer = GhostFaceNetS(embedding_size=128).to(device)
    checkpoint = torch.load(recognizer_path, map_location=device, weights_only=True)
    recognizer.load_state_dict(checkpoint["model_state_dict"])
    recognizer.eval()
    print(f"  [READY]   {recognizer_path}")
    print(f"            Epoch: {checkpoint.get('epoch', 0) + 1}  |  Training Loss: {checkpoint.get('loss', 0.0):.4f}")

    # ── Step 4: End-to-End Timed Inference ────────────────────────────────────
    print("\n[STEP 4] End-to-End Inference (mock toll-plaza camera frame)")
    mock_frame     = torch.randn(1, 3, 480, 640).to(device)
    mock_face_crop = torch.randn(1, 3, 112, 112).to(device)
    CLASS_NAMES    = ["REAL FACE", "PHOTO SPOOF", "VIDEO REPLAY SPOOF"]

    with torch.no_grad():
        # Face Detection
        t0 = time.perf_counter()
        bboxes, _ = detector(mock_frame)
        t_detect = (time.perf_counter() - t0) * 1000

        # Liveness Verification
        t0 = time.perf_counter()
        probs = torch.softmax(liveness(mock_face_crop), dim=1)
        t_liveness = (time.perf_counter() - t0) * 1000
        pred_class = torch.argmax(probs, dim=1).item()

        # Face Embedding
        t0 = time.perf_counter()
        embedding = recognizer(mock_face_crop)
        t_embed = (time.perf_counter() - t0) * 1000

    print(f"\n  Face Detection    : {t_detect:.2f} ms  |  Bbox shape: {list(bboxes.shape)}")
    print(f"  Liveness Check    : {t_liveness:.2f} ms  |  {CLASS_NAMES[pred_class]} ({probs[0][pred_class]*100:.1f}% conf.)")
    print(f"  Face Embedding    : {t_embed:.2f} ms  |  {embedding.shape[1]}-D  |  L2 norm: {torch.norm(embedding, p=2, dim=1).item():.4f}")

    print("\n" + "="*60)
    print("  INTEGRATION STATUS: ALL THREE MODELS OPERATIONAL — PASSED")
    print("="*60 + "\n")


# ──────────────────────────────────────────────────────────────────────────────
# Entry Point
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="NHAI Edge AI Pipeline Utility")
    parser.add_argument("--sync",     action="store_true", help="Sync model weights from Hugging Face Hub")
    parser.add_argument("--validate", action="store_true", help="Run end-to-end integration validation")
    parser.add_argument("--upload",   action="store_true", help="Upload ONNX models to Hugging Face Hub")
    args = parser.parse_args()

    # Default: run both sync and validate if no flags specified
    if not args.sync and not args.validate and not args.upload:
        args.sync     = True
        args.validate = True

    if args.upload:
        upload_models()
    if args.sync:
        sync_weights()
    if args.validate:
        validate_pipeline()
