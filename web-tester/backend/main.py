"""
main.py — FastAPI application for the NHAI Face AI Web Tester
=============================================================
Endpoints:
  GET  /health          — liveness probe
  GET  /model-info      — model metadata
  POST /predict         — run full 3-stage inference on a frame
  POST /register        — register a named face identity
  GET  /identities      — list all registered identities
  DELETE /identities/{name} — remove an identity
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models import FacePipeline, b64_to_bgr
from schemas import (
    PredictRequest, PredictResponse, BoundingBox, Latencies,
    RegisterRequest, RegisterResponse,
    IdentitiesResponse, IdentityRecord,
    TelemetryResponse,
)

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)

import time

# ── App State ──────────────────────────────────────────────────────────────────
pipeline: FacePipeline | None = None
session_start_time: float = time.time()
session_telemetry = {
    "total_inferences": 0,
    "total_latency_ms": 0.0,
    "real_faces": 0,
    "spoof_faces": 0
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipeline
    # Try INT8 first; fall back to FP32 if ConvInteger is not supported
    for variant in ("int8", "fp32"):
        try:
            logger.info(f"Loading ONNX models ({variant.upper()})...")
            pipeline = FacePipeline(variant=variant)
            logger.info(f"Pipeline ready ✓  [{variant.upper()}]")
            break
        except Exception as exc:
            logger.warning(f"{variant.upper()} load failed: {exc}")
            if variant == "fp32":
                raise  # both failed, give up
    yield
    logger.info("Shutting down...")


# ── FastAPI App ────────────────────────────────────────────────────────────────
app = FastAPI(
    title="NHAI Face AI Web Tester",
    description="Real-time face detection, liveness, and recognition via ONNX INT8 models.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "pipeline_ready": pipeline is not None}


@app.get("/model-info")
async def model_info():
    return {
        "variant": pipeline.variant if pipeline else "not loaded",
        "models": {
            "detector":   "linzaer_detector_int8.onnx",
            "liveness":   "mini_fas_net_int8.onnx",
            "recognizer": "ghostfacenet_s_int8.onnx",
        },
        "liveness_classes": ["REAL", "PHOTO_SPOOF", "VIDEO_SPOOF"],
        "embedding_dim": 128,
    }


@app.post("/predict", response_model=PredictResponse)
async def predict(req: PredictRequest):
    if pipeline is None:
        raise HTTPException(503, "Pipeline not ready")

    img = b64_to_bgr(req.frameB64)
    if img is None:
        raise HTTPException(400, "Could not decode frameB64")

    raw = pipeline.predict(img)

    bbox = None
    if raw["bbox"]:
        b = raw["bbox"]
        bbox = BoundingBox(
            xMin=b["x1"], yMin=b["y1"], xMax=b["x2"], yMax=b["y2"],
            confidence=b["confidence"],
        )

    lat = raw["latencies"]
    
    # Update ephemeral telemetry
    session_telemetry["total_inferences"] += 1
    session_telemetry["total_latency_ms"] += lat.get("total_ms", 0)
    
    if raw["face_detected"]:
        if raw["liveness_label"] == "REAL":
            session_telemetry["real_faces"] += 1
        elif raw["liveness_label"] and "SPOOF" in raw["liveness_label"]:
            session_telemetry["spoof_faces"] += 1

    return PredictResponse(
        faceDetected=raw["face_detected"],
        bbox=bbox,
        livenessLabel=raw["liveness_label"],
        livenessConfidence=raw["liveness_confidence"],
        embeddingNorm=raw["embedding_norm"],
        embedding=raw["embedding"],
        latencies=Latencies(
            detectionMs=lat.get("detection_ms", 0),
            livenessMs=lat.get("liveness_ms", 0),
            recognitionMs=lat.get("recognition_ms", 0),
            totalMs=lat.get("total_ms", 0),
        ),
        topMatch=raw["top_match"],
        matchScore=raw["match_score"],
    )


@app.post("/register", response_model=RegisterResponse)
async def register(req: RegisterRequest):
    if pipeline is None:
        raise HTTPException(503, "Pipeline not ready")

    img = b64_to_bgr(req.frameB64)
    if img is None:
        raise HTTPException(400, "Could not decode frameB64")

    name = req.name.strip()
    if not name:
        raise HTTPException(400, "Name cannot be empty")

    result = pipeline.register(img, name)
    return RegisterResponse(
        success=result["success"],
        message=result["message"],
        embeddingNorm=result.get("embedding_norm"),
    )


@app.get("/identities", response_model=IdentitiesResponse)
async def list_identities():
    if pipeline is None:
        raise HTTPException(503, "Pipeline not ready")
    records = pipeline.list_identities()
    return IdentitiesResponse(
        identities=[
            IdentityRecord(
                name=r["name"],
                embeddingNorm=r["embedding_norm"]
            )
            for r in records
        ],
        count=len(records),
    )


@app.delete("/identities/{name}")
async def delete_identity(name: str):
    if pipeline is None:
        raise HTTPException(503, "Pipeline not ready")
    removed = pipeline.delete_identity(name)
    if not removed:
        raise HTTPException(404, f"Identity '{name}' not found")
    return {"success": True, "message": f"Deleted '{name}'"}

@app.get("/telemetry", response_model=TelemetryResponse)
async def get_telemetry():
    t_inf = session_telemetry["total_inferences"]
    avg_lat = session_telemetry["total_latency_ms"] / t_inf if t_inf > 0 else 0.0
    uptime = time.time() - session_start_time
    return TelemetryResponse(
        totalInferences=t_inf,
        avgLatencyMs=avg_lat,
        realFaces=session_telemetry["real_faces"],
        spoofFaces=session_telemetry["spoof_faces"],
        uptimeSeconds=uptime,
    )
