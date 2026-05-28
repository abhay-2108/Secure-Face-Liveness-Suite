cmake_minimum_required(VERSION 3.10)

project(NHAIEdgeVisionEngine)

# Ensure C++17 compilation for standard library models and vector operations
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Compile flags optimization for low-latency edge devices
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O3 -ffast-math -funroll-loops")

# Define target paths
set(JSI_SRC_DIR ${CMAKE_CURRENT_SOURCE_DIR})
set(PREPROCESSING_SRC_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../preprocessing)

# Native library target containing our JSI bindings, models, and CLAHE preprocessors
add_library(
    nhai_edge_vision_engine
    SHARED
    ${JSI_SRC_DIR}/TFLiteEngine.cpp
    ${JSI_SRC_DIR}/VisionCameraJSIPlugin.cpp
    ${PREPROCESSING_SRC_DIR}/clahe_preprocessor.cpp
)

# Header includes
target_include_directories(
    nhai_edge_vision_engine
    PUBLIC
    ${JSI_SRC_DIR}
    ${PREPROCESSING_SRC_DIR}
    # React Native Android NDK headers (for JSI references)
    ${REACT_ANDROID_DIR}/src/main/jni
    # TFLite headers
    ${TFLITE_INCLUDE_DIR}
)

# System and external dependencies linked during Android NDK compilation
target_link_libraries(
    nhai_edge_vision_engine
    log             # Android system logging framework
    android         # Android native APIs
    jsi             # React Native JSI engine
    tensorflowlite  # TensorFlow Lite native C++ runtime library
)
