#!/bin/bash
# OpenFace Edge Engine - Automated Rust Build Script
# This script compiles the Rust engine for Android and iOS architectures.
# Usage: ./build_rust.sh

set -e

echo "🚀 Booting OpenFace Rust Compiler Pipeline..."

# 1. Check dependencies
if ! command -v cargo &> /dev/null; then
    echo "❌ Error: Rust (cargo) is not installed. Install via rustup."
    exit 1
fi

if ! command -v cargo-ndk &> /dev/null; then
    echo "📦 Installing cargo-ndk for Android cross-compilation..."
    cargo install cargo-ndk
fi

# Ensure targets exist
rustup target add aarch64-linux-android armv7-linux-androideabi
rustup target add aarch64-apple-ios

cd rust_engine

echo "🔨 Building for Android (arm64-v8a)..."
cargo ndk -t arm64-v8a -o ../react-native-open-face/android/src/main/jniLibs build --release

echo "🔨 Building for Android (armeabi-v7a)..."
cargo ndk -t armeabi-v7a -o ../react-native-open-face/android/src/main/jniLibs build --release

echo "🔨 Building for iOS (aarch64-apple-ios)..."
cargo build --target aarch64-apple-ios --release

# Move iOS static library to the Podspec directory
mkdir -p ../react-native-open-face/ios/libs
cp target/aarch64-apple-ios/release/libopen_face_engine.a ../react-native-open-face/ios/libs/

echo "✅ Build Complete! Rust binaries successfully injected into the React Native module."
