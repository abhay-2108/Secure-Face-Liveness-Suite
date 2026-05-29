/**
 * Native module specification for DatalakeVision.
 *
 * This module bridges JavaScript to the native Rust engine via:
 * - Android: Java NativeModule → JNI → Rust .so
 * - iOS: Objective-C module → C FFI → Rust .a
 */

import { NativeModules, Platform } from 'react-native';

const LINKING_ERROR =
  `The package 'react-native-datalake-vision' doesn't seem to be linked. Make sure:\n\n` +
  Platform.select({ ios: '- You ran `pod install` in the ios directory\n', default: '' }) +
  '- You rebuilt the app after installing the package\n';

export interface NativeDatalakeVisionSpec {
  /**
   * Initializes the Rust Edge AI Engine and memory arenas.
   */
  initializeEngine(): Promise<string>;

  /**
   * Gets the number of offline records waiting to be synced via CRDT.
   */
  getPendingSyncCount(): Promise<number>;

  /**
   * Generates the Ed25519 signed JSON payload containing all pending records.
   */
  generateSyncPayload(): Promise<string>;

  /**
   * Verifies the cryptographic token returned by the AWS Lambda and purges the ledger.
   * @param recordIds - JSON array string of record UUIDs.
   * @param serverToken - The signed purge token from AWS.
   * @param serverPublicKey - The server's Ed25519 public key.
   */
  verifyAndPurge(recordIds: string, serverToken: string, serverPublicKey: string): Promise<boolean>;
}

const NativeDatalakeVision: NativeDatalakeVisionSpec =
  NativeModules.DatalakeVision
    ? NativeModules.DatalakeVision
    : new Proxy(
        {},
        {
          get() {
            throw new Error(LINKING_ERROR);
          },
        },
      );

export default NativeDatalakeVision;
