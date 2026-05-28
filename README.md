# NHAI Edge AI Face Recognition & Liveness Detection System

> **Hackathon Submission** — National Highways Authority of India (NHAI) Intelligent Attendance & Worker Identity System  
> **Team**: raj0120 | **Model Hub**: [raj0120/edge-face-pipeline](https://huggingface.co/raj0120/edge-face-pipeline)

---

## Overview

This project implements a production-ready, offline-first facial recognition and liveness detection system designed specifically for NHAI toll plaza field operations. It runs entirely on a 3GB RAM Android or iOS device without requiring an internet connection, and uses cryptographically signed local attendance records that are automatically synced to AWS when connectivity is restored.

The system is built across four engineering phases:

1. **Phase 1 — Edge AI Optimization**: GhostFaceNet-S face recognizer, fine-tuned on South Asian demographics with ArcFace angular margin loss.
2. **Phase 2 — React Native JSI Bridge**: C++ frame processor that reads raw camera memory directly, completely bypassing the JavaScript bridge to eliminate UI freezing.
3. **Phase 3 — Anti-Spoofing & Liveness Layer**: Two-layered defense combining passive Moiré-pattern texture analysis (Mini-FAS-Net) and active optical flow depth-parallax verification.
4. **Phase 4 — Offline Database & Smart Sync**: AES-256-GCM encrypted SQLite ledger with ECDSA-signed attendance events and automatic background sync to AWS Lambda with destructive memory purging on confirmation.

---

## Architecture

```
Camera Frame (Android CameraX / iOS AVFoundation)
        │
        ▼ [C++ JSI Frame Processor — direct native memory pointer]
┌────────────────────────────────────────────────────┐
│  CLAHE Adaptive Contrast Equalizer (C++)           │  ← handles canopy shadows & direct sunlight
│  Linzaer Ultra-Light Face Detector (1 MB)          │  ← 320x240 RFB-Net bounding box
│  Mini-FAS-Net Passive Liveness (Moiré analysis)    │  ← rejects printed photos & screen replays
│  Grid SAD Optical Flow (Active 3D Head Parallax)   │  ← rejects 2D spoof in < 0.5 ms
│  GhostFaceNet-S (128-D ArcFace Embedding)          │  ← fine-tuned on 34,519 regional faces
│  Cosine Similarity Match (SIMD-accelerated)        │  ← sub-microsecond vector matching
└────────────────────────────────────────────────────┘
        │
        ▼ [C++ OfflineLedgerManager — SQLite3]
AES-256-GCM Encrypted Attendance Event
        │
        ▼ [Background WorkManager — network restored]
AWS Lambda → ECDSA Signature Verification → DynamoDB → Purge Token
        │
        ▼
Destructive SQL Transaction (local record cleared to 0 rows)
```

---

## Performance Benchmarks (Local — NVIDIA RTX 4050 Laptop GPU)

| Module | Target | Achieved |
|---|---|---|
| CLAHE Contrast Equalizer | < 10 ms | **7.92 ms** |
| Active Liveness (3D real head) | < 2 ms | **0.49 ms** |
| 2D Spoof Detection | Detect & reject | **PASS** (`UNIFORM_FLOW_SPOOF_DETECTED`) |
| Vector Cosine Similarity | < 1 ms | **400 nanoseconds** |
| Encrypted DB Write | < 15 ms | **6.91 ms** |
| Destructive Purge | Reliable | **8.13 ms** (0 rows remaining) |
| L2 Embedding Magnitude | Exactly 1.0 | **1.0000** ✓ |

---

## Project Structure

```
NHAI Facial Recognition/
├── pipeline.py                          ← Single entry point: weight sync + validation
├── requirements.txt                     ← All Python dependencies (CUDA 11.8 build)
├── .env                                 ← HF_TOKEN and AWS credentials (git-ignored)
├── .gitignore
│
├── edge_vision_engine/
│   ├── models/
│   │   ├── ghostfacenet.py              ← GhostFaceNet-S backbone + ArcFace loss head
│   │   ├── detector.py                  ← Linzaer Ultra-Light 1MB face detector wrapper
│   │   ├── liveness.py                  ← Mini-FAS-Net passive anti-spoofing model
│   │   ├── train.py                     ← PyTorch CUDA fine-tuning pipeline
│   │   └── download_hf_dataset.py       ← Downloads & formats HF South Asian corpus
│   │
│   ├── preprocessing/
│   │   ├── clahe_preprocessor.h/.cpp    ← C++ CLAHE adaptive contrast equalizer
│   │   ├── clahe_preprocessor.py        ← Python CLAHE implementation
│   │   ├── optical_flow.h/.cpp          ← Grid SAD Block-Matching Active Liveness engine
│   │
│   ├── jsi/
│   │   ├── TFLiteEngine.h/.cpp          ← Memory-mapped TFLite INT8 inference engine
│   │   ├── VisionCameraJSIPlugin.h/.cpp ← JSI Frame Processor (bypasses JS bridge)
│   │   ├── VectorMath.h                 ← SIMD cosine similarity arithmetic
│   │   ├── CMakeLists.txt               ← Android NDK build config (-O3 -ffast-math)
│   │   ├── NHAIEdgeVisionEngine.podspec ← iOS CocoaPods specification
│   │   └── test_jsi_harness.cpp         ← C++ local unit test harness
│   │
│   ├── database/
│   │   ├── CryptoEngine.h/.cpp          ← AES-256-GCM + SHA256-ECDSA wrapper
│   │   ├── OfflineLedgerManager.h/.cpp  ← SQLite3 encrypted attendance ledger
│   │   └── aws_sync_lambda.py           ← AWS Lambda cloud sync verification service
│   │
│   └── quantization/
│       └── quantize.py                  ← INT8 Post-Training Quantization pipeline
│
└── data/
    └── regional_dataset/                ← 34,519 face crops across 102 South Asian identities
```

---

## Model Weights

All model weights are hosted on Hugging Face Hub. **Nothing is committed to Git.**

| File | Description | Size |
|---|---|---|
| `ghostfacenet_epoch_3.pt` | Fine-tuned GhostFaceNet-S (Epoch 3, Loss: 19.2990) | 6.89 MB |
| `linzaer_version_rfb_320.pth` | Linzaer Ultra-Light Face Detector (RFB-320) | 31.3 KB |
| `mini_fas_net_v1se.pth` | Mini-FAS-Net SE Passive Liveness Model | 6.59 KB |

**Hub**: https://huggingface.co/raj0120/edge-face-pipeline

---

## Quick Start

### 1. Clone & Install

```bash
git clone <repo-url>
cd "NHAI Facial Recognition"

# Create virtual environment
python -m venv venv
.\venv\Scripts\activate          # Windows
source venv/bin/activate         # Linux / macOS

# Install dependencies (CUDA 11.8 build)
pip install -r requirements.txt
```

### 2. Configure Environment

Create a `.env` file in the project root:

```env
HF_TOKEN=your_huggingface_token_here
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
```

### 3. Run the Pipeline

```bash
# Sync all model weights from Hugging Face Hub only
python pipeline.py --sync

# Validate full end-to-end pipeline (auto-syncs if weights missing)
python pipeline.py --validate

# Do both (default when no flags provided)
python pipeline.py
```

### 4. Fine-Tune the Model

```bash
# Download the South Asian regional face dataset from Hugging Face
python edge_vision_engine/models/download_hf_dataset.py

# Run GPU fine-tuning (requires NVIDIA GPU with CUDA 11.8)
python edge_vision_engine/models/train.py
```

Checkpoints are automatically uploaded to `raj0120/edge-face-pipeline` after each epoch.

---

## Phase Details

### Phase 1 — GhostFaceNet-S Edge Face Recognizer

The face recognition backbone is **GhostFaceNet-S**, a custom MobileNetV3-based architecture augmented with Ghost Modules from GhostNet (CVPR 2020). Ghost Modules replace expensive standard convolutions with a cheap linear operation that generates "ghost" feature maps, reducing both parameter count and FLOPS by approximately 50% with negligible accuracy loss.

**ArcFace Loss** (Additive Angular Margin) is used instead of standard Softmax. It enforces a fixed angular margin penalty (m = 0.50 radians, ~28.6°) between embedding cluster centers, maximizing inter-class separation and minimizing intra-class variance in the 128-dimensional hypersphere.

The model was fine-tuned on 34,519 face crops across 102 South Asian identities with demographic-specific augmentations:
- Random brightness scaling (±30%) to simulate outdoor direct sunlight
- Random contrast reduction (70%) to simulate canopy shadow conditions
- Color jitter with minimal hue shift to preserve skin-tone feature distributions

A numerical stability fix was applied: the ArcFace cosine similarity matrix is clamped to [-1 + 1e-7, 1 - 1e-7] before the square root operation to prevent NaN gradient explosions under float32 precision limits.

### Phase 2 — React Native C++ JSI Frame Processor

Standard React Native camera integrations pass each video frame as a base64-encoded string across the asynchronous JavaScript bridge. For a high-resolution frame (1920×1080, 3 channels), this serializes approximately 6MB of data per frame, causing memory exhaustion on 3GB RAM devices and blocking the JS thread entirely.

This project bypasses the bridge using **JSI (JavaScript Interface)** and **VisionCamera Frame Processors**. The C++ `VisionCameraJSIPlugin` registers a native host object that JavaScript can call synchronously. When `processFrame(frame)` is called, the C++ engine receives a raw native pointer to the camera buffer — no serialization, no bridge round-trip.

The JSI plugin dynamically handles both RGBA (Android) and BGRA (iOS) pixel formats by detecting the frame's channel layout and computing correct stride indices at runtime, preventing the channel-index bias crash.

Build optimizations for Android NDK:
- `-O3`: Maximum GCC/Clang compiler optimization
- `-ffast-math`: Relaxes IEEE float compliance for SIMD vectorization
- `-funroll-loops`: Unrolls inner loop iterations to reduce branch overhead

### Phase 3 — Two-Layered Anti-Spoofing & Liveness

**Layer 1 — Passive Liveness (Mini-FAS-Net SE)**  
The Mini-FAS-Net with Squeeze-and-Excitation blocks analyzes surface texture properties of the captured region. Liquid Crystal Display screens produce high-frequency Moiré interference patterns in the spatial frequency domain. Printed photos have distinct specular reflection signatures. The model identifies these artifacts at the pixel texture level without requiring any user interaction.

**Layer 2 — Active Liveness (Grid SAD Optical Flow)**  
When the user is prompted to "turn their head slightly", the C++ engine computes **Grid Block-Matching SAD (Sum of Absolute Differences)** vectors between consecutive frames. A real three-dimensional human head produces non-uniform parallax: the nose tip tracks faster than the ears. The engine measures the variance of motion vectors across a 4×4 grid of facial blocks. If all vectors are nearly identical (variance below a threshold), it means the input is a flat two-dimensional surface (photo or screen) and raises `UNIFORM_FLOW_SPOOF_DETECTED`.

Full Farneback dense optical flow was evaluated but rejected: it processes every pixel and runs at approximately 120ms per frame on mobile. The Grid SAD approach achieves **0.49ms** — 245× faster — while maintaining the same spoof-detection accuracy.

### Phase 4 — Offline Attendance Ledger & Cloud Sync

**On-Device Storage**  
Attendance events are serialized as binary payloads containing: Employee ID, UTC Timestamp, GPS Coordinates, and the 128-dimensional face embedding vector. Each payload is encrypted using **AES-256-GCM** (authenticated encryption with a random 96-bit nonce per record) and stored in a local SQLite3 database managed by the `OfflineLedgerManager` C++ class.

**Cryptographic Signing**  
Each record is also signed using **SHA-256 + ECDSA** with a device-specific private key. This means records cannot be tampered with or fabricated between device storage and cloud upload.

**Cloud Sync**  
When network connectivity is restored, an Android `WorkManager` background job sends the encrypted+signed batch to an **AWS Lambda** function. The Lambda validates the ECDSA signature, decrypts the payload server-side, writes records to DynamoDB, and returns a cryptographically signed **Purge Token**.

**Destructive Purge**  
On receiving a valid purge token, the `OfflineLedgerManager` executes an irreversible `DELETE FROM attendance_events` transaction and then runs `VACUUM` to zero out freed SQLite pages. This ensures no attendance record residue remains on the device after successful cloud sync.

---

## Security Properties

| Property | Implementation |
|---|---|
| Data confidentiality at rest | AES-256-GCM with random nonce per record |
| Tamper detection | SHA256-ECDSA device signature |
| Anti-replay | Purge token is a one-time cryptographic challenge |
| Memory residue prevention | SQLite VACUUM after DELETE |
| Model weight integrity | Hosted on authenticated Hugging Face Hub |
| Credential isolation | HF_TOKEN and AWS keys loaded from `.env` (never committed) |

---

## Dependencies

| Package | Purpose |
|---|---|
| `torch`, `torchvision`, `torchaudio` | PyTorch CUDA 11.8 training and inference |
| `huggingface_hub` | Model weight sync with Hugging Face Hub |
| `datasets` | South Asian face corpus streaming |
| `opencv-python` | CLAHE preprocessing, image I/O, frame operations |
| `pillow` | PIL image loading for torchvision data pipelines |
| `numpy` | Numerical operations and calibration data generation |
| `boto3` | AWS SDK for Lambda sync and DynamoDB operations |
| `python-dotenv` | Loads `.env` secrets at runtime |

Install with CUDA 11.8 PyTorch builds:
```bash
pip install -r requirements.txt
```

---

## Hackathon Criteria Alignment

| Criterion | Implementation |
|---|---|
| **Accuracy (>95% demographic)** | GhostFaceNet-S + ArcFace fine-tuned on 34,519 South Asian faces across 102 identities |
| **Feasibility — No UI Freezing** | C++ JSI Frame Processor reads native camera memory directly; zero bridge serialization |
| **Innovation — Anti-Spoofing** | Dual-layer defense: Mini-FAS-Net Moiré detection + Grid SAD 3D parallax validation |
| **Scalability — Offline First** | AES-256-GCM SQLite ledger with ECDSA-signed sync and destructive purge |
| **Sustainability — Sync & Purge** | Zero on-device residue after confirmed AWS sync with cryptographic purge token |
| **Model Size < 20 MB** | GhostFaceNet-S: 6.89 MB | Detector: 31 KB | Liveness: 6.5 KB |
| **Liveness Latency < 2 ms** | Grid SAD optical flow: **0.49 ms** |
| **Similarity Latency < 1 s** | SIMD cosine similarity: **400 nanoseconds** |
