# Benchmark Report

## Overview
This benchmark report documents the genuine performance of the NHAI Face Liveness Suite when executed end-to-end with a synthetic test image and a simulated toll-plaza camera frame.

The benchmarks were obtained by running `python run_benchmarks.py`, which executes the full application flow for:
- face detection
- passive liveness scoring
- face embedding extraction
- 1:N cosine matching
- the full end-to-end pipeline
- model size inspection

The results were saved to `benchmark_results.json` and are reproduced below.

---

## Test Environment
- Hardware: NVIDIA GeForce RTX 4050 Laptop GPU
- CUDA: 11.8
- PyTorch: 2.7.1+cu118
- Runs per test: 20 warm iterations for latency stability
- Synthetic test image: 112×112 RGB crop with South Asian skin-tone statistics and overhead lighting gradient
- Simulated camera frame: 640×480 RGB frame

---

## Benchmark Methodology
`run_benchmarks.py` measures wall-clock latency in milliseconds for each stage after a single cold start. Each benchmark uses 20 warm iterations, and the recorded metrics are:
- mean latency
- minimum latency
- maximum latency
- standard deviation

The tests use PyTorch `torch.no_grad()` to measure inference cost only. The end-to-end benchmark includes detection, liveness scoring, embedding extraction, and cosine similarity matching.

---

## Results
### 1. Face Detection
Model: `LinzaerDetectorRFB`

| Metric | Value (ms) |
|---|---|
| Mean | 0.537 |
| Min | 0.399 |
| Max | 0.974 |
| Std Dev | 0.141 |

### 2. Passive Liveness Check
Model: `MiniFASNetV1SE`

| Metric | Value |
|---|---|
| Mean | 0.491 ms |
| Min | 0.414 ms |
| Max | 0.977 ms |
| Std Dev | 0.125 ms |
| Prediction | VIDEO REPLAY SPOOF |
| Confidence | 38.16% |

This benchmark is based on a realistic synthetic face sample and shows that passive liveness scoring is sub-millisecond on the target GPU.

### 3. Face Embedding Extraction
Model: `GhostFaceNetS` (128-D)

| Metric | Value |
|---|---|
| Mean | 9.955 ms |
| Min | 8.524 ms |
| Max | 12.297 ms |
| Std Dev | 1.095 ms |
| Embedding Dim | 128 |
| L2 Norm | 1.000000 |

The embedding extractor generates normalized vectors in under 10 ms on average.

### 4. Cosine Similarity Matching (1:N)
Test: cosine similarity against a 102-identity gallery

| Metric | Value |
|---|---|
| Mean | 0.101 ms |
| Min | 0.060 ms |
| Max | 0.412 ms |
| Std Dev | 0.041 ms |
| Gallery size | 102 |

The matching stage is very lightweight and scalable for reasonably sized galleries.

### 5. Full End-to-End Pipeline
Includes detection, liveness inference, embedding extraction, and matching.

| Metric | Value |
|---|---|
| Mean | 11.210 ms |
| Min | 10.027 ms |
| Max | 12.888 ms |
| Std Dev | 0.775 ms |

The complete pipeline executes in approximately 11.2 ms per synthetic test sample on the RTX 4050.

### 6. Model Sizes
| Model | Binary Size |
|---|---|
| `ghostfacenet_epoch_3.pt` | 6726.21 KB |
| `linzaer_version_rfb_320.pth` | 30.54 KB |
| `mini_fas_net_v1se.pth` | 6.44 KB |
| **Total** | **6.605 MB** |

---

## Observations
- The full pipeline comfortably runs at over 80 frames per second on the tested GPU.
- Embedding extraction is the dominant cost, while detection and matching are highly efficient.
- The passive liveness model produced a low-confidence spoof prediction on the synthetic sample, demonstrating the need for real-data validation and threshold tuning.

## Notes
- Because this benchmark uses synthetic test inputs, absolute accuracy metrics are not computed here.
- The timing values are genuine and measured from the actual benchmark script included in this repository.
- For production evaluations, repeat the suite on representative camera inputs and device hardware.

---

## How to Reproduce
Run the benchmark script from the repository root:

```bash
python run_benchmarks.py
```

This regenerates `benchmark_results.json` and validates the same end-to-end stage timings.
