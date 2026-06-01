/**
 * @module react-native-open-face
 *
 * Edge AI facial recognition and liveness detection for React Native.
 * Powered by the OpenFace 3.0 Rust engine — zero-copy frame processing,
 * HNSW vector search, and offline-first identity management.
 */

// Core SDK API
export { OpenFace } from './OpenFace';

// Native module bridge (for advanced direct access)
export { default as NativeOpenFace } from './NativeOpenFace';
export type { NativeOpenFaceSpec } from './NativeOpenFace';

// All public types
export type {
  VisionConfig,
  FaceBoundingBox,
  LivenessChallenge,
  LivenessStatus,
  LivenessResult,
  MatchResult,
  FrameResult,
  EngineMetrics,
  SyncStatus,
  IdentityRecord,
  EnrollmentResult,
  PurgeResult,
} from './types';
