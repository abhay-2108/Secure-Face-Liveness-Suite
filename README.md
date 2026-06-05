<div align="center">
  <img src="https://raw.githubusercontent.com/tandpfun/skill-icons/main/icons/React-Dark.svg" width="60" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/tandpfun/skill-icons/main/icons/Rust.svg" width="60" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/tandpfun/skill-icons/main/icons/Python-Dark.svg" width="60" />

  <br />
  <br />

  <h1>🛡️ Aegis: Secure Face Liveness Suite</h1>

  <p>
    <strong>A military-grade, standalone facial recognition & liveness detection inference pipeline running entirely on local edge hardware.</strong>
  </p>

  <blockquote>
    <strong>Note on Nomenclature:</strong> <i>Aegis</i> is the product suite and external brand name. The internal core inference engine, React Native SDK, and C++ bridging codebase are referred to by their original engineering codename: <b>OpenFace</b>.
  </blockquote>

  <br />
  <p>
    <a href="https://github.com/facebook/react-native"><img src="https://img.shields.io/badge/React%20Native-%3E%3D%200.70-61dafb.svg?style=for-the-badge&logo=react" alt="React Native" /></a>
    <a href="https://www.rust-lang.org/"><img src="https://img.shields.io/badge/Rust-1.70+-orange.svg?style=for-the-badge&logo=rust" alt="Rust" /></a>
    <a href="https://github.com/onnx/onnx"><img src="https://img.shields.io/badge/ONNX-INT8/FP16-brightgreen.svg?style=for-the-badge&logo=onnx" alt="ONNX" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="License" /></a>
    <br />
    <a href="https://deepwiki.com/abhay-2108/Secure-Face-Liveness-Suite"><img src="https://img.shields.io/badge/📖_DeepWiki-Interactive_Docs-7B68EE?style=for-the-badge" alt="DeepWiki Documentation" /></a>
  </p>
</div>

---

<div align="center">
  <em>Designed explicitly to survive 3GB RAM constraints, severe thermal throttling, and absolute zero network connectivity. This is not a thin wrapper around a cloud API. This is pure, bare-metal inference.</em>
</div>

---

## 📱 Aegis Mobile (Primary App)

The production demo app lives in `aegis-mobile/` and is the primary UI for live camera authentication and enrollment.

### 📥 Pre-Built Release APK
For fast evaluation on physical Android devices, you can download and install our pre-built release binary directly:
👉 **[Download app-arm64-v8a-release.apk](https://github.com/abhay-2108/Secure-Face-Liveness-Suite/raw/main/react-native-open-face/aegis-app/android/app/build/outputs/apk/release/app-arm64-v8a-release.apk)**

### Build from Source
```bash
cd aegis-mobile
yarn install
yarn android
```

> **Note:** A physical Android device is required for VisionCamera frame processors.

The `react-native-open-face/aegis-app` folder is kept as a minimal sample and may lag behind the main app.

Sync settings live in `aegis-mobile/src/config/sync.ts`.

## ⚡ Core Philosophy

### 🔐 Zero-Trust Edge AI & Data Privacy (Zero Images Stored)
Aegis operates under a strict **Zero-Trust Edge AI** paradigm, meaning it is physically impossible for the system to leak or store biometric images. 
- **Ephemeral Processing:** The raw camera frames (YUV bytes) are streamed directly into the Rust engine's `MemoryArena` in volatile RAM. No image files (JPEG/PNG) are ever "clicked," saved to disk, or transmitted over a network.
- **Irreversible Extraction:** The GhostFaceNet ONNX model instantly converts the face into a mathematical 128-Dimensional Vector (e.g., `[0.142, -0.993, 0.451...]`).
- **Instant Purge:** The moment the vector is generated, the original raw image bytes are instantly destroyed by the Rust memory manager.
- **What is Stored:** The encrypted local ledger only stores the 128-D vector and a User ID. Because 128-D vectors are mathematically irreversible, even if the ledger is compromised, a human face cannot be reconstructed. 
This makes Aegis 100% compliant with strict biometric privacy laws (GDPR/CCPA).

### 🚀 Tackling Edge AI Bottlenecks
The Edge AI space is plagued by three massive problems: Memory Fragmentation, Thermal Meltdowns, and Biometric Theft. 

OpenFace solves all of these by stripping away the operating system's garbage collector and strictly separating execution across a robust 4-Tier Pipeline.

```mermaid
flowchart TB
    subgraph Tier 1: Orchestration Layer
        A[VisionCamera Worklet] -->|60 FPS Hardware Buffer| B(JSI Zero-Copy Bridge)
    end

    subgraph Tier 2: C++ Memory Bridge
        B -->|Raw Y-Plane Pointer| C(libyuv Bilinear Downscale)
        C -->|112x112 Tensor| D((Rust FFI Interface))
    end

    subgraph Tier 3: Rust Lock Arena & AI
        D --> E{Waterfall Liveness}
        E -->|Tier 1| F(Laplacian Texture)
        F -->|Tier 2| G(Optical Flow Jitter)
        G -->|Tier 3 / Front Cam| H(Screen Flash 3D)
        
        F -->|Failed| REJ[Reject: Flat Photo]
        G -->|Failed| REJ[Reject: Static Screen]
        H -->|Failed| REJ[Reject: Screen Glare]
        
        H -->|Live Human Passed| I[GhostFaceNet Extraction]
        G -->|Live / Back Cam| I
        I -->|128-D FP32 Embedding| J[(HNSW Vector Index)]
    end

    subgraph Tier 4: Zero-Trust Cryptography
        J -->|Identity Match| K{ChaCha20 Decryptor}
        K --> L[Encrypted SQLite Ledger]
    end

    style E fill:#ff4444,stroke:#333,color:#fff
    style I fill:#00C851,stroke:#333,color:#fff
    style L fill:#000,stroke:#dea584,stroke-width:2px,color:#fff
```

| 🧩 Tier | Technology | Responsibility | Hardware Intercept |
| :--- | :--- | :--- | :--- |
| **Tier 1: Orchestration** | `TypeScript / UI` | Fluid Animations, OTA Downloads | `VisionCamera` Worklets |
| **Tier 2: The Bridge** | `C++ / JSI` | Zero-Copy Buffers, `libyuv` Rescaling | Hardware `ByteBuffer` |
| **Tier 3: The Engine** | `Rust / ARM NEON` | SIMD Inference, Thermal Governance | 40MB Contiguous Lock Arena |
| **Tier 4: Cryptography** | `Rust / ChaCha20` | Symmetric Ledgers, Ed25519 Purges | CPU Bound `O_TRUNC` Wiper |

---

## 🚀 Architectural Highlights

### 🧠 O(1) Memory Arena (OOM Prevention)
Instead of allocating memory dynamically per frame, the Rust engine locks a contiguous **40MB block of physical RAM**. An atomic bump pointer moves forward during execution and rewinds to zero at the end of the frame, mathematically preventing Out-Of-Memory (OOM) crashes on low-end hardware.

### 🔌 Zero-Copy Frame Processing
React Native bridges serialize camera frames to Base64, which is disastrous for performance. OpenFace uses **JSI (JavaScript Interface)** to pass raw memory pointers directly from VisionCamera to C++ without copying a single byte.

### 🧊 Dynamic CPU Thermal Governor
Actively reads `/sys/class/thermal/`. If the CPU hits **40°C**, the Rust engine automatically drops the internal tracking from 30 FPS to 10 FPS, preventing the Android/iOS OS from forcefully hardware-throttling the silicon.

### 🛡️ Zero-Trust Cryptography
The proprietary `.onnx` models are AES-GCM encrypted on disk. Upon boot, Rust decrypts them dynamically into the Lock Arena. **Neural network weights never touch the physical NAND disk.** When syncing logs to the cloud, the engine requires an Ed25519 signature before executing an OS-level `O_TRUNC` biometric wipe.

---

## 📂 Repository Structure

```graphql
├── edge_vision_engine/       # Python ML Pipeline (PyTorch Quantization to ONNX)
├── rust_engine/              # Bare-Metal Inference Engine (tract-onnx, ChaCha20)
└── react-native-open-face/   # The React Native Frontend SDK & Zero-Copy Bridge
```

---

## 📖 Deep Technical Reading

To truly understand how this engine bypasses memory fragmentation and serialization bottlenecks, please read our architectural whitepapers:

- 📚 **[ARCHITECTURE.md](./ARCHITECTURE.md)**: A deep dive into the 4-Tier Zero-Copy bridge and the mathematical implications of the Lock Arena.

<div align="center">

<br />

### 🌐 Interactive Documentation Portal

<a href="https://deepwiki.com/abhay-2108/Secure-Face-Liveness-Suite">
  <img src="https://img.shields.io/badge/📖_DeepWiki-Explore_Full_Documentation-7B68EE?style=for-the-badge&logoColor=white" alt="DeepWiki" />
</a>

<br />
<br />

> 🔬 **[DeepWiki](https://deepwiki.com/abhay-2108/Secure-Face-Liveness-Suite)** provides an AI-powered, interactive deep-dive into every module of this project — from the Rust `MemoryArena` internals and HNSW vector search, to the C++ JNI bridge, liveness waterfall pipeline, and the full React Native SDK architecture. Perfect for judges, contributors, and anyone who wants to understand the engineering behind Aegis without reading thousands of lines of source code.

</div>


## 🏃 Quick Start (Mobile SDK)

To build and run the primary Aegis Mobile app on your device:

```bash
cd aegis-mobile
yarn install

# Run on Android Hardware
yarn android

```

> **Note:** The aegis-app will only run on physical hardware. Simulators do not support the raw camera JSI bridging required by OpenFace.

<div align="center">
  <br/>
  <i>Built with ❤️ for the Open Source Edge Community.</i>
</div>
