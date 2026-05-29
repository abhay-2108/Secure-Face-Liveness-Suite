/**
 * @module react-native-datalake-vision
 *
 * Edge AI facial recognition and liveness detection for React Native.
 * Powered by the Datalake 3.0 Rust engine — zero-copy frame processing,
 * HNSW vector search, and offline-first identity management.
 */

// Export the raw native bridge
export { default as NativeDatalakeVision } from './NativeDatalakeVision';

// Export the React hooks and components for UI Integration
export * from '../example/src/hooks/useDatalakeVision';
export * from '../example/src/components/CameraPreview';
export * from '../example/src/components/LivenessPromptUI';
export * from '../example/src/components/TelemetryHUD';
export * from '../example/src/screens/AuthenticationScreen';
