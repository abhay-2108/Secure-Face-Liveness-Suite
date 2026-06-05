# NHAI Aegis — Face AI Web Tester

A premium browser-based dashboard to test the three ONNX INT8 edge AI models in real time via webcam.

## Stack
- **Frontend**: React 18 + Vite + TypeScript
- **Backend**: FastAPI + uvicorn + ONNX Runtime

## Quick Start

### 1. Backend
```powershell
cd web-tester/backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. Frontend (separate terminal)
```powershell
cd web-tester/frontend
npm install
npm run dev
```

Open **http://localhost:5173**

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Backend liveness probe |
| GET | `/model-info` | Model metadata |
| POST | `/predict` | Run 3-stage inference on a frame |
| POST | `/register` | Register a named face identity |
| GET | `/identities` | List all identities |
| DELETE | `/identities/{name}` | Remove an identity |

## Models Used (INT8)
- `linzaer_detector_int8.onnx` — Ultra-light face detector
- `mini_fas_net_int8.onnx` — Passive liveness (REAL / PHOTO_SPOOF / VIDEO_SPOOF)
- `ghostfacenet_s_int8.onnx` — 128-D face embedding for recognition
