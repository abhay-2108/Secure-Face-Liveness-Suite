cmake_minimum_required(VERSION 3.22.1)
project("datalake_vision" LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Path to the pre-built Rust shared library
set(RUST_LIB_DIR "${CMAKE_SOURCE_DIR}/src/main/jniLibs/${ANDROID_ABI}")

# JNI bridge source — thin wrapper that calls extern "C" Rust functions
add_library(datalake_vision_jni SHARED
    src/main/cpp/datalake_vision_jni.cpp
    # CRITICAL FIX: The Zero-Copy Frame Processor was missing from the build!
    src/main/cpp/FrameProcessorPlugin.cpp
)

# Link against the pre-built Rust engine static/shared library
add_library(datalake_engine SHARED IMPORTED)
set_target_properties(datalake_engine PROPERTIES
    IMPORTED_LOCATION "${RUST_LIB_DIR}/libdatalake_engine.so"
)

# Find the Android log and graphics libraries
find_library(log-lib log)
find_library(android-lib android)

# Link against React Native and Vision Camera headers
target_include_directories(datalake_vision_jni PRIVATE
    src/main/cpp
    # Typical include paths for React Native and Vision Camera (in a real build, Gradle resolves these)
    ../../node_modules/react-native/ReactAndroid/src/main/jni
    ../../node_modules/react-native-vision-camera/android/src/main/cpp
)

target_link_libraries(datalake_vision_jni
    datalake_engine
    ${log-lib}
    ${android-lib}
)
