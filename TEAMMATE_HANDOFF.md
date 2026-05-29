# 🤝 Developer & Teammate Handoff Guide

This document contains all the technical build instructions, scripts, and deployment steps for the Datalake Vision Edge Engine. It is intended for the internal engineering team.

---

## 🛠️ Tasks (AI / Rust Lead)

The Rust architecture is built, memory-safe, and secured. You are responsible for injecting the final AI models and compiling the engine.

### 1. Finalize the ONNX Injection
The Rust engine currently uses a "Pixel Variance Reality Check" to simulate the pipeline. You need to wire in the actual Tract inference:
* Drop your fine-tuned `.onnx` models into: 
  `react-native-datalake-vision/example/android/app/src/main/assets`
* Open `rust_engine/src/lib.rs`.
* In `datalake_vision_process_frame`, uncomment the Tract inference lines and pass the `AAssetManager` pointer down from the Java JNI layer to load the models.

### 2. Compile the Rust Binaries
You no longer have to manually move `.so` files around! I have created an automated cross-compilation pipeline.
In the root of the project, run:
```bash
./build_rust.sh
```
This script uses `cargo-ndk` to automatically cross-compile the Rust engine for Android (`arm64-v8a`, `armeabi-v7a`) and iOS (`aarch64-apple-ios`). It will automatically inject the `.so` and `.a` binaries directly into the React Native module.

---

## 📱 Tasks for Frontend / App Lead

The React Native architecture is ready. You are responsible for building the physical prototype and the final NPM package.

### 1. Build the Physical Android Prototype
To get the dark-mode glassmorphism UI running on a physical Android device for the demo:

```bash
cd react-native-datalake-vision/example
npm install
cd android
./gradlew assembleRelease
```
*CRITICAL: Make sure Abhay has run `./build_rust.sh` BEFORE you build the Android app, otherwise the JNI layer will fail to find the `.so` files!*

### 2. Package for the Datalake 3.0 Team
When the NHAI judges ask how the Datalake 3.0 team will integrate this module into their existing app, you will demonstrate the tarball approach.

Run the following command inside the `react-native-datalake-vision` folder:
```bash
npm pack
```
This will generate a `react-native-datalake-vision-1.0.0.tgz` package. The NHAI team can simply run `npm install path/to/tarball.tgz` in their project, and they instantly get the entire Rust engine and Camera UI.
