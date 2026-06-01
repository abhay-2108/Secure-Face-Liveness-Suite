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
  initialize(configJson: string): Promise<string>;
  searchIdentity(embeddingJson: string): Promise<string>;
  enrollIdentity(label: string, embeddingJson: string): Promise<string>;
  getSyncStatus(): Promise<string>;
  getMetrics(): Promise<string>;
  forcePurge(): Promise<string>;
  triggerSync(): Promise<void>;
  shutdown(): Promise<void>;
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
