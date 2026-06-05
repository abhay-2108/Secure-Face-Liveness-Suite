# NHAI Aegis — Face AI Web Tester

A premium, real-time web dashboard designed to validate and profile the three-stage Edge AI pipeline (Face Detection, Passive Liveness Detection, and Face Recognition) using ONNX models and OpenCV.

![NHAI Aegis Dashboard](https://raw.githubusercontent.com/tandpfun/skill-icons/main/icons/Markdown-Dark.svg)

---

## Key Features & Architecture

### 1. Robust Hybrid Face Detection
- **OpenCV Haar Cascade Integration**: Instead of relying on raw untrained neural network outputs for face tracking, this tester runs a hybrid system. It uses OpenCV’s highly robust `haarcascade_frontalface_default.xml` Haar Cascade classifier to extract tight, accurate face coordinates.
- **ONNX Profiling**: The Linzaer Face Detector ONNX model is still executed on every frame to measure and report exact edge-device inference latency, but the Haar Cascade coordinates are used for visual UI rendering and face cropping.
- **Decoupled Cropping**: Bounding boxes are drawn tightly around the face in the camera view, but a local **10% padding** is automatically applied to crops before they are fed into liveness and recognition models to guarantee high classification accuracy.

### 2. Premium Un-Mirrored Overlay UI
- **Horizontal Mathematical Mirroring**: Webcams are horizontally mirrored by default for user comfort. To avoid mirroring the bounding box text, we disabled CSS mirroring on the `<canvas>` overlay and implemented mathematical mirroring in JavaScript:
  $$\text{xMin}_{\text{mirrored}} = \text{Canvas Width} - (\text{xMax} \times \text{Scale})$$
  This displays the bounding box on the correct mirrored face position while rendering the text normally from left to right.
- **Intelligent pill positioning**: If the face gets too close to the top of the frame, the badge pill is dynamically drawn inside the bounding box instead of being clipped off-screen.
- **Shadow & Line Optimization**: Uses clean slate slate-900 glassmorphism backgrounds for text pills and has reduced shadow blur to `4` for a sharp, clean interface.

### 3. State Cleansing
- The right statistics panel instantly resets to an empty state ("Start camera to begin") as soon as the camera is stopped, ensuring no stale or confusing data is shown.

### 4. Standard Aegis API Schemas
- Request and response schemas have been standardized to `camelCase` to match the native Aegis Rust Engine FFI payloads (e.g. `faceDetected`, `xMin`, `yMin`, `xMax`, `yMax`, `livenessLabel`, `livenessConfidence`, `embeddingNorm`, etc.).

---

## Stack
- **Frontend**: React 18 + Vite + TypeScript
- **Backend**: FastAPI + Uvicorn + ONNX Runtime (CPU fallback / CUDA)
- **Image Processing**: OpenCV (python-opencv)

---

## Quick Start

### 1. Start the Backend
Navigate to the backend directory, activate your virtual environment, install the dependencies, and start the Uvicorn server:
```powershell
cd web-tester/backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
The backend will automatically try loading INT8 quantized ONNX models first, and fall back to FP32 models if the host device lacks INT8 runtime optimizations.

### 2. Start the Frontend (Separate Terminal)
Navigate to the frontend directory, install npm packages, and run the Vite development server:
```powershell
cd web-tester/frontend
npm install
npm run dev
```

Open your browser and navigate to **http://localhost:5173** to begin testing.
