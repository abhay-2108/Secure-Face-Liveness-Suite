// src/api/inference.ts
// All API calls to the FastAPI backend

export interface BoundingBox {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  confidence: number;
}

export interface Latencies {
  detectionMs: number;
  livenessMs: number;
  recognitionMs: number;
  totalMs: number;
}

export interface PredictResponse {
  faceDetected: boolean;
  bbox: BoundingBox | null;
  livenessLabel: string | null;
  livenessConfidence: number | null;
  embeddingNorm: number | null;
  embedding: number[] | null;
  latencies: Latencies;
  topMatch: string | null;
  matchScore: number | null;
}

export interface RegisterResponse {
  success: boolean;
  message: string;
  embeddingNorm: number | null;
}

export interface IdentityRecord {
  name: string;
  embeddingNorm: number;
}

export interface IdentitiesResponse {
  identities: IdentityRecord[];
  count: number;
}

// Uses environment variable in production, falls back to Vite proxy in development
// @ts-ignore
const BASE = import.meta.env.VITE_API_BASE_URL || 'https://kshitijpalsinghtomar-aegis-face-liveness-api.hf.space';

export async function predict(frameB64: string): Promise<PredictResponse> {
  const res = await fetch(`${BASE}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frameB64: frameB64, useInt8: true }),
  });
  if (!res.ok) throw new Error(`predict ${res.status}`);
  return res.json();
}

export async function registerFace(
  frameB64: string,
  name: string,
): Promise<RegisterResponse> {
  const res = await fetch(`${BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frameB64: frameB64, name }),
  });
  if (!res.ok) throw new Error(`register ${res.status}`);
  return res.json();
}

export async function getIdentities(): Promise<IdentitiesResponse> {
  const res = await fetch(`${BASE}/identities`);
  if (!res.ok) throw new Error(`identities ${res.status}`);
  return res.json();
}

export async function deleteIdentity(name: string): Promise<void> {
  const res = await fetch(`${BASE}/identities/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`delete ${res.status}`);
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`);
    const data = await res.json();
    return data.pipeline_ready === true;
  } catch {
    return false;
  }
}

export async function getModelInfo() {
  const res = await fetch(`${BASE}/model-info`);
  if (!res.ok) throw new Error('model-info failed');
  return res.json();
}
