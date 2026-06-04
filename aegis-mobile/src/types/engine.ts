/**
 * OpenFace Engine Types
 * =====================
 * TypeScript type definitions that exactly match the JSON output
 * from the Rust engine's FFI functions in lib.rs
 */

/** Result from a single camera frame processed through the full ML pipeline */
export interface FrameResult {
  faceDetected: boolean;
  boundingBox: BoundingBox | null;
  liveness: LivenessResult | null;
  embedding: number[];
  match: MatchResult | null;
  totalLatencyMs: number;
  metrics: FrameMetrics;
  error?: string;
}

export interface BoundingBox {
  yMin: number;
  xMin: number;
  yMax: number;
  xMax: number;
  confidence: number;
}

export interface LivenessResult {
  isReal: boolean;
  silentScore: number;
  opticalFlowPassed: boolean;
  blinkDetected: boolean;
  status: LivenessStatus;
  currentChallenge: LivenessChallenge;
  challengeProgress: number;
  reflectionPassed?: boolean;
  jitterPassed?: boolean;
}

export type LivenessStatus =
  | 'pending'
  | 'in_progress'
  | 'passed'
  | 'failed'
  | 'timeout';

export type LivenessChallenge =
  | 'turn_head'
  | 'blink'
  | 'hold_still'
  | 'screen_flash'
  | 'none';

export interface MatchResult {
  matched: boolean;
  similarity: number;
  identityId: string;
  identityLabel: string;
  searchLatencyMs: number;
}

export interface FrameMetrics {
  preprocessLatencyMs: number;
  livenessLatencyMs: number;
  hnswLatencyMs: number;
  inferenceLatencyMs: number;
}

/** Engine-level metrics from open_face_get_metrics() */
export interface EngineMetrics {
  arenaLockedMb: number;
  modelSizeMb: number;
  hnswLatencyMs: number;
  inferenceLatencyMs: number;
  detectionLatencyMs: number;
  livenessLatencyMs: number;
  recognitionLatencyMs: number;
  preprocessLatencyMs: number;
  syncStatus: string;
  indexSize: number;
}

/** Sync status from open_face_get_sync_status() */
export interface SyncStatus {
  pendingCount: number;
  syncedCount: number;
  totalCount: number;
  isConnected: boolean;
  lastSyncTimestamp: number | null;
  mode: 'offline' | 'synced' | 'syncing';
}

/** Telemetry data displayed in the HUD */
export interface Telemetry {
  arena: string;
  model: string;
  hnsw: string;
  inference: string;
  thermal: string;
  sync: string;
  fps: string;
}

/** Engine initialization config */
export interface EngineConfig {
  arena_size: number;
  model_path: string;
  hnsw_index_path: string;
  ledger_db_path: string;
  clahe_clip_limit: number;
  inference_threads: number;
  match_threshold: number;
  liveness_threshold: number;
  offline_mode: boolean;
}

/** Enrollment result */
export interface EnrollmentResult {
  success: boolean;
  identityId: string;
  error?: string;
}
