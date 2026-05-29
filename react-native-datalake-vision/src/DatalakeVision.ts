/**
 * DatalakeVision — high-level JavaScript API for the Datalake 3.0
 * edge AI facial recognition and liveness detection engine.
 *
 * This class wraps the raw NativeModule, handling JSON serialization,
 * error normalization, and type-safe return values. All AI/crypto/storage
 * logic runs in the native Rust engine — this layer is pure orchestration.
 *
 * @example
 * ```typescript
 * import { DatalakeVision } from 'react-native-datalake-vision';
 *
 * // Initialize engine
 * await DatalakeVision.initialize({
 *   arenaSize: 40,
 *   modelPath: '/data/models',
 *   matchThreshold: 0.68,
 * });
 *
 * // Search for an identity
 * const match = await DatalakeVision.searchIdentity(embedding);
 * if (match.matched) {
 *   console.log(`Matched: ${match.identityLabel}`);
 * }
 * ```
 */

import NativeDatalakeVision from './NativeDatalakeVision';
import type {
  VisionConfig,
  MatchResult,
  SyncStatus,
  EngineMetrics,
  EnrollmentResult,
  PurgeResult,
} from './types';

/**
 * Parse a JSON string from the native bridge, with error handling.
 */
function parseNativeResponse<T>(json: string): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    throw new Error(
      `[DatalakeVision] Failed to parse native response: ${json}`
    );
  }
}

/**
 * Static API class for interacting with the Datalake Vision engine.
 * All methods are async and delegate to the native Rust engine.
 *
 * The frame processor (camera pipeline) is registered separately via JSI
 * and does not go through this class — it operates at the C++/JSI level
 * for zero-copy, zero-bridge-overhead frame processing.
 */
export class DatalakeVision {
  private static _initialized = false;

  /**
   * Initialize the Datalake Vision engine.
   *
   * This loads the TFLite models into memory-mapped buffers,
   * allocates the arena, and builds or loads the HNSW index.
   * Must be called once before using any other method.
   *
   * @param config - Engine configuration
   * @returns Promise that resolves when the engine is ready
   * @throws Error if initialization fails (e.g. missing model files)
   */
  static async initialize(config: VisionConfig): Promise<void> {
    const configJson = JSON.stringify({
      arena_size: config.arenaSize,
      model_path: config.modelPath,
      hnsw_index_path: config.hnswIndexPath ?? '',
      ledger_db_path: config.ledgerDbPath ?? '',
      clahe_clip_limit: config.claheClipLimit ?? 2.0,
      inference_threads: config.inferenceThreads ?? 2,
      match_threshold: config.matchThreshold ?? 0.68,
      liveness_threshold: config.livenessThreshold ?? 0.85,
      offline_mode: config.offlineMode ?? true,
    });

    const resultJson = await NativeDatalakeVision.initialize(configJson);
    const result = parseNativeResponse<{ success: boolean; error?: string }>(
      resultJson
    );

    if (!result.success) {
      throw new Error(
        `[DatalakeVision] Initialization failed: ${result.error ?? 'unknown error'}`
      );
    }

    DatalakeVision._initialized = true;
  }

  /**
   * Search the HNSW vector index for a matching identity.
   *
   * The Rust engine performs approximate nearest neighbor search
   * using a hierarchical navigable small world graph, typically
   * completing in <1ms for indices up to 100K vectors.
   *
   * @param embedding - 128-dimensional face embedding vector
   * @returns Promise resolving to the match result
   * @throws Error if the engine is not initialized
   */
  static async searchIdentity(embedding: number[]): Promise<MatchResult> {
    DatalakeVision.assertInitialized();
    const resultJson = await NativeDatalakeVision.searchIdentity(
      JSON.stringify(embedding)
    );
    return parseNativeResponse<MatchResult>(resultJson);
  }

  /**
   * Enroll a new identity into the local encrypted ledger and HNSW index.
   *
   * The embedding is stored in the AES-256-GCM encrypted SQLite database
   * and indexed in the HNSW graph for future searches. The record is
   * marked for sync to the remote Datalake when connectivity is available.
   *
   * @param label - Human-readable identity label (e.g. employee name)
   * @param embedding - 128-dimensional face embedding vector
   * @returns Promise resolving to the enrollment result
   * @throws Error if the engine is not initialized
   */
  static async enrollIdentity(
    label: string,
    embedding: number[]
  ): Promise<EnrollmentResult> {
    DatalakeVision.assertInitialized();
    const resultJson = await NativeDatalakeVision.enrollIdentity(
      label,
      JSON.stringify(embedding)
    );
    return parseNativeResponse<EnrollmentResult>(resultJson);
  }

  /**
   * Get the current sync status of the local ledger.
   *
   * @returns Promise resolving to the sync status
   * @throws Error if the engine is not initialized
   */
  static async getSyncStatus(): Promise<SyncStatus> {
    DatalakeVision.assertInitialized();
    const resultJson = await NativeDatalakeVision.getSyncStatus();
    return parseNativeResponse<SyncStatus>(resultJson);
  }

  /**
   * Get current engine performance metrics.
   *
   * Returns timing data for each pipeline stage, memory usage,
   * and HNSW index statistics. Used by TelemetryHUD.
   *
   * @returns Promise resolving to engine metrics
   * @throws Error if the engine is not initialized
   */
  static async getMetrics(): Promise<EngineMetrics> {
    DatalakeVision.assertInitialized();
    const resultJson = await NativeDatalakeVision.getMetrics();
    return parseNativeResponse<EngineMetrics>(resultJson);
  }

  /**
   * Force a manual purge of the local ledger.
   *
   * Removes all synced records from the encrypted database and
   * rebuilds the HNSW index from remaining entries. This reclaims
   * storage space on the device.
   *
   * @returns Promise resolving to the purge result
   * @throws Error if the engine is not initialized
   */
  static async forcePurge(): Promise<PurgeResult> {
    DatalakeVision.assertInitialized();
    const resultJson = await NativeDatalakeVision.forcePurge();
    return parseNativeResponse<PurgeResult>(resultJson);
  }

  /**
   * Trigger a manual sync attempt with the remote Datalake.
   *
   * Sends pending records to the cloud and pulls any new identities.
   * No-op if already syncing or if in offline-only mode.
   *
   * @throws Error if the engine is not initialized
   */
  static async triggerSync(): Promise<void> {
    DatalakeVision.assertInitialized();
    await NativeDatalakeVision.triggerSync();
  }

  /**
   * Shut down the engine and release all native resources.
   *
   * After calling this, the engine must be re-initialized
   * before any further use.
   */
  static async shutdown(): Promise<void> {
    if (DatalakeVision._initialized) {
      await NativeDatalakeVision.shutdown();
      DatalakeVision._initialized = false;
    }
  }

  /**
   * Check if the engine has been initialized.
   */
  static get isInitialized(): boolean {
    return DatalakeVision._initialized;
  }

  /**
   * Assert that the engine is initialized, throwing if not.
   */
  private static assertInitialized(): void {
    if (!DatalakeVision._initialized) {
      throw new Error(
        '[DatalakeVision] Engine not initialized. Call DatalakeVision.initialize() first.'
      );
    }
  }
}
