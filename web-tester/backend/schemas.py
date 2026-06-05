"""
schemas.py — Pydantic request / response models for the NHAI Face AI Web Tester
"""
from pydantic import BaseModel
from typing import Optional, List


class PredictRequest(BaseModel):
    frameB64: str          # base64-encoded JPEG
    useInt8: bool = True


class BoundingBox(BaseModel):
    xMin: int
    yMin: int
    xMax: int
    yMax: int
    confidence: float


class Latencies(BaseModel):
    detectionMs: float
    livenessMs: float
    recognitionMs: float
    totalMs: float


class PredictResponse(BaseModel):
    faceDetected: bool
    bbox: Optional[BoundingBox] = None
    livenessLabel: Optional[str] = None   # "REAL" | "PHOTO_SPOOF" | "VIDEO_SPOOF"
    livenessConfidence: Optional[float] = None
    embeddingNorm: Optional[float] = None
    embedding: Optional[List[float]] = None  # 128-D vector (for registration)
    latencies: Latencies
    topMatch: Optional[str] = None         # identity name if registered
    matchScore: Optional[float] = None     # cosine similarity [0,1]


class RegisterRequest(BaseModel):
    frameB64: str
    name: str


class RegisterResponse(BaseModel):
    success: bool
    message: str
    embeddingNorm: Optional[float] = None


class IdentityRecord(BaseModel):
    name: str
    embeddingNorm: float


class IdentitiesResponse(BaseModel):
    identities: List[IdentityRecord]
    count: int
