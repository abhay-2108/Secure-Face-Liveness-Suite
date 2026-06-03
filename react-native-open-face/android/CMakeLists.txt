cmake_minimum_required(VERSION 3.22.1)
project("open_face" LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Fix for 16KB page alignment on Android 15+ devices
# Enable PIE (Position Independent Executable) for all binaries
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Path to the pre-built Rust shared library
set(RUST_LIB_DIR "${CMAKE_SOURCE_DIR}/src/main/jniLibs/${ANDROID_ABI}")

# JNI bridge source — thin wrapper that calls extern "C" Rust functions
add_library(open_face_jni SHARED
    src/main/cpp/openface_jni.cpp

)

# Link against the pre-built Rust engine static/shared library
add_library(OpenFace_engine SHARED IMPORTED)
set_target_properties(OpenFace_engine PROPERTIES
    IMPORTED_LOCATION "${RUST_LIB_DIR}/libopen_face_engine.so"
    IMPORTED_SONAME "libopen_face_engine.so"
)

# Find the Android log and graphics libraries
find_library(log-lib log)
find_library(android-lib android)

# Fetch libyuv for image conversion
include(FetchContent)
FetchContent_Declare(
  libyuv
  GIT_REPOSITORY https://chromium.googlesource.com/libyuv/libyuv
  GIT_TAG main
)
FetchContent_MakeAvailable(libyuv)

target_link_libraries(open_face_jni
    OpenFace_engine
    yuv
    ${log-lib}
    ${android-lib}
)

# Ensure libyuv headers are accessible
target_include_directories(open_face_jni PRIVATE ${libyuv_SOURCE_DIR}/include)
