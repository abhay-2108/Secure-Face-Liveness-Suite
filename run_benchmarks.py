"""
run_benchmarks.py — NHAI Edge AI Genuine Benchmark Suite
=========================================================
Runs every pipeline component against a real synthetic face image
(skin-tone correct 112x112 RGB crop with gradient lighting) and
records actual wall-clock timings from the live CUDA environment.

Outputs benchmark_results.json which is used to generate BENCHMARK.md.

Usage:
    python run_benchmarks.py
"""

import os, sys, json, time, statistics
sys.path.append(os.path.join(os.path.dirname(__file__), "edge_vision_engine", "models"))

import torch
import torch.nn.functional as F
import numpy as np

from detector import LinzaerDetectorRFB
from liveness import MiniFASNetV1SE
from ghostfacenet import GhostFaceNetS

HF_REPO_ID     = "raj0120/edge-face-pipeline"
CHECKPOINT_DIR = "edge_vision_engine/checkpoints"
WEIGHTS_DIR    = "edge_vision_engine/models/weights"
RUNS           = 20   # warm-run iterations for stable averages

# ── helpers ───────────────────────────────────────────────────────────────────
def _ensure(filename, local_path):
    if not os.path.exists(local_path):
        from huggingface_hub import hf_hub_download
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        dl = hf_hub_download(repo_id=HF_REPO_ID, filename=filename,
                             local_dir=os.path.dirname(local_path))
        if os.path.abspath(dl) != os.path.abspath(local_path):
            os.replace(dl, local_path)

def bench(fn, runs=RUNS):
    """Returns (mean_ms, min_ms, max_ms, stdev_ms) over `runs` warm iterations."""
    # one cold run to load CUDA kernels
    fn()
    times = []
    for _ in range(runs):
        t0 = time.perf_counter()
        result = fn()
        times.append((time.perf_counter() - t0) * 1000)
    return result, round(statistics.mean(times), 3), round(min(times), 3), round(max(times), 3), round(statistics.stdev(times), 3)

# ── synthetic face image ──────────────────────────────────────────────────────
def make_face_image(device):
    """
    Generates a realistic-statistics 112x112 RGB face crop.
    Uses South Asian skin-tone mean (approx 0.55, 0.40, 0.32 in [0,1])
    with Gaussian lighting gradient to simulate outdoor toll-plaza illumination.
    """
    rng = np.random.default_rng(42)
    h, w = 112, 112
    # Base skin-tone layer
    img = np.zeros((3, h, w), dtype=np.float32)
    img[0] = np.clip(rng.normal(0.55, 0.08, (h, w)), 0, 1)  # R
    img[1] = np.clip(rng.normal(0.40, 0.06, (h, w)), 0, 1)  # G
    img[2] = np.clip(rng.normal(0.32, 0.05, (h, w)), 0, 1)  # B
    # Add overhead sunlight gradient (bright top, shadow bottom — canopy effect)
    gradient = np.linspace(1.3, 0.7, h).reshape(h, 1)
    img = np.clip(img * gradient, 0, 1)
    # Normalize to GhostFaceNet expected range [-1, 1]
    img = (img - 0.5) / 0.5
    tensor = torch.tensor(img, dtype=torch.float32).unsqueeze(0).to(device)
    return tensor

def make_camera_frame(device):
    """Simulates a full 640x480 toll-plaza camera frame (3-channel)."""
    rng = np.random.default_rng(7)
    frame = rng.normal(0.45, 0.15, (1, 3, 480, 640)).astype(np.float32)
    frame = np.clip(frame, 0, 1)
    return torch.tensor(frame).to(device)

# ── main benchmark ────────────────────────────────────────────────────────────
def main():
    print("=" * 64)
    print("  NHAI EDGE AI — Genuine Performance Benchmark Suite")
    print(f"  Runs per test: {RUNS} warm iterations")
    print("=" * 64)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
    print(f"\n  Hardware : {gpu_name}")
    print(f"  CUDA     : {torch.version.cuda if torch.cuda.is_available() else 'N/A'}")
    print(f"  PyTorch  : {torch.__version__}\n")

    results = {
        "hardware": gpu_name,
        "cuda_version": str(torch.version.cuda),
        "pytorch_version": torch.__version__,
        "runs_per_test": RUNS,
        "benchmarks": {}
    }

    # ── Load models ──────────────────────────────────────────────────────────
    print("[LOAD] Syncing weights from Hub...")
    _ensure("linzaer_version_rfb_320.pth", f"{WEIGHTS_DIR}/linzaer_version_rfb_320.pth")
    _ensure("mini_fas_net_v1se.pth",       f"{WEIGHTS_DIR}/mini_fas_net_v1se.pth")
    _ensure("ghostfacenet_epoch_3.pt",     f"{CHECKPOINT_DIR}/ghostfacenet_epoch_3.pt")

    detector = LinzaerDetectorRFB().to(device)
    detector.load_state_dict(torch.load(f"{WEIGHTS_DIR}/linzaer_version_rfb_320.pth", map_location=device))
    detector.eval()

    liveness = MiniFASNetV1SE().to(device)
    liveness.load_state_dict(torch.load(f"{WEIGHTS_DIR}/mini_fas_net_v1se.pth", map_location=device))
    liveness.eval()

    ckpt = torch.load(f"{CHECKPOINT_DIR}/ghostfacenet_epoch_3.pt", map_location=device)
    recognizer = GhostFaceNetS(embedding_size=128).to(device)
    recognizer.load_state_dict(ckpt["model_state_dict"])
    recognizer.eval()
    print("[LOAD] All three models ready.\n")

    face_crop   = make_face_image(device)
    camera_frame = make_camera_frame(device)

    # ── BENCHMARK 1: Face Detection ──────────────────────────────────────────
    print("[TEST 1] Face Detection (Linzaer RFB-320) ...")
    with torch.no_grad():
        _, mean, mn, mx, sd = bench(lambda: detector(camera_frame))
    print(f"         mean={mean} ms  min={mn} ms  max={mx} ms  stdev={sd} ms")
    results["benchmarks"]["face_detection"] = {"mean_ms": mean, "min_ms": mn, "max_ms": mx, "stdev_ms": sd}

    # ── BENCHMARK 2: Passive Liveness (Mini-FAS-Net) ─────────────────────────
    print("[TEST 2] Passive Liveness Check (Mini-FAS-Net SE) ...")
    with torch.no_grad():
        probs_out, mean, mn, mx, sd = bench(lambda: torch.softmax(liveness(face_crop), dim=1))
    pred_class  = torch.argmax(probs_out, dim=1).item()
    class_names = ["REAL FACE", "PHOTO SPOOF", "VIDEO REPLAY SPOOF"]
    confidence  = round(probs_out[0][pred_class].item() * 100, 2)
    print(f"         mean={mean} ms  min={mn} ms  max={mx} ms  stdev={sd} ms")
    print(f"         Predicted: {class_names[pred_class]}  ({confidence}% confidence)")
    results["benchmarks"]["passive_liveness"] = {
        "mean_ms": mean, "min_ms": mn, "max_ms": mx, "stdev_ms": sd,
        "prediction": class_names[pred_class], "confidence_pct": confidence
    }

    # ── BENCHMARK 3: Face Embedding Generation ───────────────────────────────
    print("[TEST 3] Face Embedding Extraction (GhostFaceNet-S 128-D) ...")
    with torch.no_grad():
        embedding, mean, mn, mx, sd = bench(lambda: recognizer(face_crop))
    l2_norm = round(torch.norm(embedding, p=2, dim=1).item(), 6)
    print(f"         mean={mean} ms  min={mn} ms  max={mx} ms  stdev={sd} ms")
    print(f"         L2 norm: {l2_norm}  (must be 1.0000)")
    results["benchmarks"]["face_embedding"] = {
        "mean_ms": mean, "min_ms": mn, "max_ms": mx, "stdev_ms": sd,
        "embedding_dim": 128, "l2_norm": l2_norm
    }

    # ── BENCHMARK 4: Cosine Similarity (1:N matching) ────────────────────────
    print("[TEST 4] 1:N Cosine Similarity Matching (against 102-identity gallery) ...")
    # Build a mock gallery of 102 class-center vectors (normalized)
    gallery = F.normalize(torch.randn(102, 128, device=device), p=2, dim=1)
    with torch.no_grad():
        def cosine_match():
            scores = F.linear(embedding, gallery)  # [1, 102]
            return torch.argmax(scores, dim=1)
        match_out, mean, mn, mx, sd = bench(cosine_match, runs=1000)
    print(f"         mean={mean} ms  min={mn} ms  max={mx} ms  stdev={sd} ms")
    results["benchmarks"]["cosine_similarity_1_102"] = {
        "mean_ms": mean, "min_ms": mn, "max_ms": mx, "stdev_ms": sd,
        "gallery_size": 102
    }

    # ── BENCHMARK 5: Full End-to-End Pipeline ────────────────────────────────
    print("[TEST 5] Full End-to-End Pipeline (Detection -> Liveness -> Embedding -> Match) ...")
    with torch.no_grad():
        def full_pipeline():
            detector(camera_frame)
            probs = torch.softmax(liveness(face_crop), dim=1)
            emb   = recognizer(face_crop)
            scores = F.linear(emb, gallery)
            return torch.argmax(scores, dim=1)
        _, mean, mn, mx, sd = bench(full_pipeline)
    print(f"         mean={mean} ms  min={mn} ms  max={mx} ms  stdev={sd} ms")
    results["benchmarks"]["full_pipeline"] = {"mean_ms": mean, "min_ms": mn, "max_ms": mx, "stdev_ms": sd}

    # ── BENCHMARK 6: Model Sizes ──────────────────────────────────────────────
    print("[TEST 6] Model Binary Sizes ...")
    sizes = {
        "ghostfacenet_epoch_3.pt":     os.path.getsize(f"{CHECKPOINT_DIR}/ghostfacenet_epoch_3.pt"),
        "linzaer_version_rfb_320.pth": os.path.getsize(f"{WEIGHTS_DIR}/linzaer_version_rfb_320.pth"),
        "mini_fas_net_v1se.pth":       os.path.getsize(f"{WEIGHTS_DIR}/mini_fas_net_v1se.pth"),
    }
    total_bytes = sum(sizes.values())
    for name, sz in sizes.items():
        print(f"         {name}: {sz/1024:.1f} KB")
    print(f"         Total: {total_bytes/1024/1024:.2f} MB")
    results["benchmarks"]["model_sizes"] = {k: round(v/1024, 2) for k, v in sizes.items()}
    results["benchmarks"]["model_sizes"]["total_mb"] = round(total_bytes/1024/1024, 3)

    # ── Save raw results ──────────────────────────────────────────────────────
    with open("benchmark_results.json", "w") as f:
        json.dump(results, f, indent=2)
    print("\n[SAVED] Raw results → benchmark_results.json")
    print("\n" + "=" * 64)
    print("  Benchmark suite complete.")
    print("=" * 64)
    return results


if __name__ == "__main__":
    main()
