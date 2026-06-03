<div align="center">
  <h1>🛡️ React Native OpenFace</h1>

  <p>
    <strong>Ultra-lightweight, offline-first facial recognition and liveness detection SDK for React Native.</strong>
  </p>

  <p>
    <a href="https://github.com/facebook/react-native"><img src="https://img.shields.io/badge/React%20Native-%3E%3D%200.70-61dafb.svg?style=for-the-badge&logo=react" alt="React Native" /></a>
    <a href="https://www.rust-lang.org/"><img src="https://img.shields.io/badge/Rust-1.70+-orange.svg?style=for-the-badge&logo=rust" alt="Rust" /></a>
  </p>
</div>

---

**OpenFace** is not a thin wrapper around a cloud API. It is a military-grade, standalone AI inference pipeline running entirely on local edge hardware. Powered by a proprietary bare-metal Rust engine, it is mathematically optimized for extreme edge environments—specifically designed to survive 3GB RAM constraints, severe thermal throttling, and absolute zero network connectivity.

## 📦 Installation

```sh
npm install react-native-open-face
# or
yarn add react-native-open-face
```



### Android Setup

Add the following to your `babel.config.js` to enable the VisionCamera and Reanimated worklets. Ensure these plugins are listed in the exact order shown below:

```javascript
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    ['react-native-worklets-core/plugin'],
    ['react-native-reanimated/plugin'],
  ],
};
```

Ensure your `android/local.properties` file contains the correct absolute path to your Android SDK and NDK installations.

---

## 💻 Usage Example

OpenFace hooks seamlessly into `react-native-vision-camera`. The `useOpenFace` hook abstracts the entire complex Rust memory arena, threading, and JSI bridge into a simple, declarative React state.

```tsx
import { useOpenFace } from 'react-native-open-face/aegis-app/src/hooks/useOpenFace';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  const device = useCameraDevice('front');
  
  // The hook handles the Zero-Copy JSI binding automatically
  const { isReady, frameProcessor, livenessPrompt, livenessStatus } = useOpenFace();

  if (!device || !isReady) return <Text>Initializing OpenFace Edge Engine...</Text>;

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        frameProcessor={frameProcessor}
        pixelFormat="yuv"
      />
      
      {/* Declarative Feedback Loop */}
      <Text style={styles.prompt}>{livenessPrompt}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  prompt: { position: 'absolute', bottom: 50, color: 'white', fontSize: 24, textAlign: 'center', width: '100%' }
});
```

---

## 🛡️ React Native Error Boundaries

OpenFace relies heavily on hardware JSI camera interceptors. We strongly recommend wrapping your UI components in an `ErrorBoundary` (provided in our examples) to gracefully handle background `CameraDevice` permission rejections or hardware pipeline stalls without crashing your JavaScript thread.

---

## 🏗 High-Level System Architecture

OpenFace strictly enforces a 4-tier separation of concerns to maximize performance while maintaining developer ergonomics:

1. **TypeScript (React Native)** - Pure declarative UI, Spring Animations (Reanimated 3), and OTA Module updating via HTTP.
2. **Java / Objective-C** - Native Modules handling Over-The-Air (OTA) ONNX encrypted updates, Asset Management, and background thread orchestration.
3. **C++ (JSI / JNI / FFI)** - `libyuv` high-speed bilinear frame resizing and the Zero-copy memory bridge, eliminating Base64 string serialization overhead.
4. **Bare-Metal Rust Engine** - The mathematical core handling the O(1) Memory Arenas, AI Liveness Pipeline, HNSW Vector Database, Thermal CPU Governance, and Ed25519 Secure Offline Cryptography.

For an incredibly deep technical dive into the algorithms, read our [ARCHITECTURE.md](../ARCHITECTURE.md) whitepaper in the main repository.

---

<div align="center">
  <i>OpenFace is licensed under the MIT License.</i>
</div>
