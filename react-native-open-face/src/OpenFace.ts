/**
 * OpenFace - high-level JavaScript API for the OpenFace 3.0
 * edge AI facial recognition and liveness detection engine.
 *
 * This class wraps the raw NativeModule, handling JSON serialization,
 * error normalization, and type-safe return values. All AI/crypto/storage
 * logic runs in the native Rust engine; this layer is pure orchestration.
 *
 * @example
 * ```typescript
 * import { OpenFace } from 'react-native-open-face';
 *
 * // Initialize engine
 * await OpenFace.initialize({
 *   arenaSize: 40,
 *   modelPath: '/data/models',
 *   matchThreshold: 0.68,
 * });
 *
 * // Search for an identity
 * const match = await OpenFace.searchIdentity(embedding);
 * if (match.matched) {
 *   console.log(`Matched: ${match.identityLabel}`);
 * }
 * ```
 */

import NativeOpenFace from './NativeOpenFace';
import type {
  VisionConfig,
  MatchResult,
  SyncStatus,
  EngineMetrics,
  EnrollmentResult,
  PurgeResult,
  LedgerExportResult,
} from './types';

/**
 * Parse a JSON string from the native bridge, with error handling.
 */
function parseNativeResponse<T>(json: string): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    throw new Error(
      `[OpenFace] Failed to parse native response: ${json}`
    );
  }
}

/**
 * Static API class for interacting with the OpenFace engine.
 * All methods are async and delegate to the native Rust engine.
 *
 * The frame processor (camera pipeline) is registered separately via JSI
 * and does not go through this class; it operates at the C++/JSI level
 * for zero-copy, zero-bridge-overhead frame processing.
 */
export class OpenFace {
  private static _initialized = false;

  /**
   * Initialize the OpenFace engine.
   *
   * This loads bundled model assets where available, allocates the arena,
   * and initializes the local vector index.
   * Must be called once before using any other method.
   *
   * @param config - Engine configuration
   * @returns Promise that resolves when the engine is ready
   * @throws Error if initialization fails (e.g. missing model files)
   */
  static async initialize(config: VisionConfig): Promise<void> {
    if (config.deviceId) {
      const deviceResultJson = await NativeOpenFace.setDeviceId(config.deviceId);
      const deviceResult = parseNativeResponse<{ success: boolean; error?: string }>(
        deviceResultJson
      );
      if (!deviceResult.success) {
        throw new Error(
          `[OpenFace] Device ID injection failed: ${deviceResult.error ?? 'unknown error'}`
        );
      }
    }

    const configJson = JSON.stringify({
      arena_size: config.arenaSize,
      model_path: config.modelPath,
      hnsw_index_path: config.hnswIndexPath ?? '',
      ledger_db_path: config.ledgerDbPath ?? '',
      device_id: config.deviceId ?? '',
      clahe_clip_limit: config.claheClipLimit ?? 2.0,
      inference_threads: config.inferenceThreads ?? 2,
      match_threshold: config.matchThreshold ?? 0.68,
      liveness_threshold: config.livenessThreshold ?? 0.85,
      offline_mode: config.offlineMode ?? true,
    });

    const resultJson = await NativeOpenFace.initialize(configJson);
    const result = parseNativeResponse<{ success: boolean; error?: string }>(
      resultJson
    );

    if (!result.success) {
      throw new Error(
        `[OpenFace] Initialization failed: ${result.error ?? 'unknown error'}`
      );
    }

    const modelsLoaded = await NativeOpenFace.loadModels('');
    if (!modelsLoaded) {
      throw new Error(
        `[OpenFace] Model loading failed: unknown error`
      );
    }

    OpenFace._initialized = true;
  }

  /**
   * Search the local vector index for a matching identity.
   *
  * The current Rust engine uses a real HNSW approximate nearest
  * neighbor index for sublinear search at scale.
   *
   * @param embedding - 128-dimensional face embedding vector
   * @returns Promise resolving to the match result
   * @throws Error if the engine is not initialized
   */
  static async searchIdentity(embedding: number[]): Promise<MatchResult> {
    OpenFace.assertInitialized();
    const resultJson = await NativeOpenFace.searchIdentity(
      JSON.stringify(embedding)
    );
    return parseNativeResponse<MatchResult>(resultJson);
  }

  /**
   * Enroll a new identity into the local encrypted ledger and HNSW index.
   *
   * The embedding is stored through the local Rust ledger path
   * and indexed in the local vector index for future searches. The record is
   * marked for sync to the remote OpenFace when connectivity is available.
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
    OpenFace.assertInitialized();
    const resultJson = await NativeOpenFace.enrollIdentity(
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
    OpenFace.assertInitialized();
    const resultJson = await NativeOpenFace.getSyncStatus();
    return parseNativeResponse<SyncStatus>(resultJson);
  }

  /**
   * Export the encrypted ledger as base64 for a sync upload.
   */
  static async exportLedgerBase64(): Promise<LedgerExportResult> {
    OpenFace.assertInitialized();
    const resultJson = await NativeOpenFace.exportLedgerBase64();
    return parseNativeResponse<LedgerExportResult>(resultJson);
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
    OpenFace.assertInitialized();
    const resultJson = await NativeOpenFace.getMetrics();
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
    OpenFace.assertInitialized();
    const resultJson = await NativeOpenFace.forcePurge();
    return parseNativeResponse<PurgeResult>(resultJson);
  }

  /**
   * Verify a purge token and truncate the local ledger.
   */
  static async verifyAndPurge(
    recordIds: string[],
    purgeTokenHex: string,
    serverPublicKeyHex: string,
  ): Promise<PurgeResult> {
    OpenFace.assertInitialized();
    const resultJson = await NativeOpenFace.verifyAndPurge(
      JSON.stringify(recordIds),
      purgeTokenHex,
      serverPublicKeyHex,
    );
    return parseNativeResponse<PurgeResult>(resultJson);
  }

  /**
   * Update sync status used by UI telemetry.
   */
  static async setSyncStatus(
    status: 'offline' | 'syncing' | 'synced' | 'error',
  ): Promise<void> {
    OpenFace.assertInitialized();
    await NativeOpenFace.setSyncStatus(status);
  }

  /**
   * Trigger a manual sync attempt with the remote OpenFace.
   *
   * Signals a manual sync attempt. The current native implementation
   * updates local state; production HTTP upload/ack handling must be
   * completed in the JS/backend integration path.
   *
   * @throws Error if the engine is not initialized
   */
  static async triggerSync(): Promise<void> {
    OpenFace.assertInitialized();
    await NativeOpenFace.triggerSync();
  }

  /**
   * Shut down the engine and release all native resources.
   *
   * After calling this, the engine must be re-initialized
   * before any further use.
   */
  static async shutdown(): Promise<void> {
    if (OpenFace._initialized) {
      await NativeOpenFace.shutdown();
      OpenFace._initialized = false;
    }
  }

  /**
   * Check if the engine has been initialized.
   */
  static get isInitialized(): boolean {
    return OpenFace._initialized;
  }

  /**
   * Assert that the engine is initialized, throwing if not.
   */
  private static assertInitialized(): void {
    if (!OpenFace._initialized) {
      throw new Error(
        '[OpenFace] Engine not initialized. Call OpenFace.initialize() first.'
      );
    }
  }
}
