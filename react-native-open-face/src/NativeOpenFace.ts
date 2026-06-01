/**
 * Native module specification for OpenFace.
 *
 * This module bridges JavaScript to the native Rust engine via:
 * - Android: Java NativeModule → JNI → Rust .so
 * - iOS: Objective-C module → C FFI → Rust .a
 */

import { NativeModules, Platform } from 'react-native';

const LINKING_ERROR =
  `The package 'react-native-OpenFace-vision' doesn't seem to be linked. Make sure:\n\n` +
  Platform.select({ ios: '- You ran `pod install` in the ios directory\n', default: '' }) +
  '- You rebuilt the app after installing the package\n';

export interface NativeOpenFaceSpec {
  initialize(configJson: string): Promise<string>;
  searchIdentity(embeddingJson: string): Promise<string>;
  enrollIdentity(label: string, embeddingJson: string): Promise<string>;
  getSyncStatus(): Promise<string>;
  getMetrics(): Promise<string>;
  forcePurge(): Promise<string>;
  triggerSync(): Promise<void>;
  shutdown(): Promise<void>;
}

const NativeOpenFace: NativeOpenFaceSpec =
  NativeModules.OpenFace
    ? NativeModules.OpenFace
    : new Proxy(
        {},
        {
          get() {
            throw new Error(LINKING_ERROR);
          },
        },
      );

export default NativeOpenFace;
