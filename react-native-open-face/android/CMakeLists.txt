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

# Provide the path to the pre-built Rust shared library
link_directories("${RUST_LIB_DIR}")

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

# To prevent lld from hardcoding relative paths into DT_NEEDED, we copy the Rust library
# directly into the CMake build directory. This ensures the relative path is just the filename.
file(COPY "${RUST_LIB_DIR}/libopen_face_engine.so" DESTINATION "${CMAKE_CURRENT_BINARY_DIR}")

add_library(open_face_engine SHARED IMPORTED)
set_target_properties(open_face_engine PROPERTIES
    IMPORTED_LOCATION "${CMAKE_CURRENT_BINARY_DIR}/libopen_face_engine.so"
)

target_link_libraries(open_face_jni
    open_face_engine
    yuv
    ${log-lib}
    ${android-lib}
)

# Ensure libyuv headers are accessible
target_include_directories(open_face_jni PRIVATE ${libyuv_SOURCE_DIR}/include)
