/**
 * TypeScript interfaces for all data flowing between the JavaScript layer
 * and the native Rust engine. Every struct here mirrors a C FFI struct
 * serialized through the JNI (Android) or C FFI (iOS) bridge.
 */

/**
 * Configuration for initializing the OpenFace engine.
 * Passed to the native side on first load.
 */
export interface VisionConfig {
  /** Pre-allocated arena size in megabytes (default: 40MB) */
  arenaSize: number;

  /** Absolute path to the directory containing .tflite model files */
  modelPath: string;

  /** Path to the HNSW index file, or where it should be created */
  hnswIndexPath?: string;

  /** Path to the encrypted SQLite ledger database */
  ledgerDbPath?: string;

  /** CLAHE clip limit for low-light preprocessing (default: 2.0) */
  claheClipLimit?: number;

  /** Number of NNAPI / CoreML threads to allocate (default: 2) */
  inferenceThreads?: number;

  /** Cosine similarity threshold for identity match (default: 0.68) */
  matchThreshold?: number;

  /** Liveness confidence threshold (default: 0.85) */
  livenessThreshold?: number;

  /** Enable offline-first mode with local ledger (default: true) */
  offlineMode?: boolean;
}

/**
 * Bounding box of a detected face within the camera frame.
 * Coordinates are normalized to [0, 1] relative to frame dimensions.
 */
export interface FaceBoundingBox {
  /** Top-left Y coordinate (normalized 0–1) */
  yMin: number;
  /** Top-left X coordinate (normalized 0–1) */
  xMin: number;
  /** Bottom-right Y coordinate (normalized 0–1) */
  yMax: number;
  /** Bottom-right X coordinate (normalized 0–1) */
  xMax: number;
  /** Detection confidence (0–1) */
  confidence: number;
}

/**
 * Possible liveness challenge prompts the UI should display.
 */
export type LivenessChallenge =
  | 'turn_head'
  | 'blink'
  | 'hold_still'
  | 'none';

/**
 * Current status of the active liveness verification pipeline.
 */
export type LivenessStatus =
  | 'pending'
  | 'in_progress'
  | 'passed'
  | 'failed'
  | 'timeout';

/**
 * Result of silent + active liveness verification.
 */
export interface LivenessResult {
  /** Whether the subject is determined to be a live person */
  isReal: boolean;

  /** Silent anti-spoof confidence score (0–1) */
  silentScore: number;

  /** Optical flow parallax verification passed */
  opticalFlowPassed: boolean;

  /** Blink detection passed */
  blinkDetected: boolean;

  /** Current liveness pipeline status */
  status: LivenessStatus;

  /** Current challenge to display to the user */
  currentChallenge: LivenessChallenge;

  /** Progress through the liveness challenge sequence (0–1) */
  challengeProgress: number;
}

/**
 * Result of an identity match against the HNSW vector index.
 */
export interface MatchResult {
  /** Whether a matching identity was found */
  matched: boolean;

  /** Cosine similarity score (0–1), 0 if no match */
  similarity: number;

  /** Matched identity ID, empty string if no match */
  identityId: string;

  /** Matched identity label/name, empty string if no match */
  identityLabel: string;

  /** HNSW search latency in milliseconds */
  searchLatencyMs: number;
}

/**
 * Complete result from processing a single camera frame through
 * the detection → liveness → recognition → match pipeline.
 */
export interface FrameResult {
  /** Whether a face was detected in the frame */
  faceDetected: boolean;

  /** Bounding box of the detected face (null if no face) */
  boundingBox: FaceBoundingBox | null;

  /** Liveness verification result (null if no face) */
  liveness: LivenessResult | null;

  /** 128-dimensional embedding vector (empty if liveness failed) */
  embedding: number[];

  /** Identity match result (null if liveness failed) */
  match: MatchResult | null;

  /** Total frame processing time in milliseconds */
  totalLatencyMs: number;

  /** Individual pipeline stage timings */
  metrics: EngineMetrics;
}

/**
 * Performance telemetry from the native engine.
 * Displayed in the developer TelemetryHUD overlay.
 */
export interface EngineMetrics {
  /** Arena memory locked in MB */
  arenaLockedMb: number;

  /** Loaded model size in MB */
  modelSizeMb: number;

  /** HNSW search latency in ms */
  hnswLatencyMs: number;

  /** Total inference latency in ms */
  inferenceLatencyMs: number;

  /** Detection stage latency in ms */
  detectionLatencyMs: number;

  /** Liveness stage latency in ms */
  livenessLatencyMs: number;

  /** Recognition stage latency in ms */
  recognitionLatencyMs: number;

  /** CLAHE preprocessing latency in ms */
  preprocessLatencyMs: number;

  /** Current sync status label */
  syncStatus: 'offline' | 'syncing' | 'synced' | 'error';

  /** Number of vectors in the HNSW index */
  indexSize: number;
}

/**
 * Sync status between the local ledger and the remote OpenFace.
 */
export interface SyncStatus {
  /** Number of records pending sync */
  pendingCount: number;

  /** Number of records successfully synced */
  syncedCount: number;

  /** Total records in the local ledger */
  totalCount: number;

  /** Whether the device is currently connected */
  isConnected: boolean;

  /** ISO timestamp of last successful sync (null if never) */
  lastSyncTimestamp: string | null;

  /** Current sync mode */
  mode: 'offline' | 'syncing' | 'synced' | 'error';
}

/**
 * An identity record stored in the local encrypted ledger.
 */
export interface IdentityRecord {
  /** Unique identity ID */
  id: string;

  /** Human-readable label (e.g. employee name) */
  label: string;

  /** 128-dimensional face embedding */
  embedding: number[];

  /** ISO timestamp of enrollment */
  enrolledAt: string;

  /** Whether the record has been synced to the remote */
  synced: boolean;
}

/**
 * Result of enrolling a new identity.
 */
export interface EnrollmentResult {
  /** Whether enrollment was successful */
  success: boolean;

  /** Assigned identity ID */
  identityId: string;

  /** Error message if enrollment failed */
  error?: string;
}

/**
 * Result of a ledger purge operation.
 */
export interface PurgeResult {
  /** Whether the purge was successful */
  success: boolean;

  /** Number of records purged */
  purgedCount: number;

  /** Number of records remaining */
  remainingCount: number;
}
