Pod::Spec.new do |s|
  s.name         = "DatalakeVision"
  s.version      = "0.1.0"
  s.summary      = "Edge AI facial recognition and liveness detection for React Native"
  s.description  = <<-DESC
    React Native native module wrapping the Datalake 3.0 Rust engine.
    Provides face detection, silent + active liveness verification,
    128-d embedding extraction, HNSW vector search, and offline-first
    encrypted identity management — all running on-device.
  DESC
  s.homepage     = "https://github.com/datalake-vision/react-native-datalake-vision"
  s.license      = { :type => "MIT", :file => "../LICENSE" }
  s.author       = { "Datalake 3.0" => "team@datalake.ai" }
  s.platform     = :ios, "15.0"
  s.source       = { :git => "https://github.com/datalake-vision/react-native-datalake-vision.git", :tag => s.version }

  s.source_files = "*.{h,m,mm}"
  
  # Pre-built Rust static library (cross-compiled via cargo-lipo)
  s.vendored_libraries = "libdatalake_engine.a"
  
  s.dependency "React-Core"
  
  # Required for linking the Rust static library
  s.pod_target_xcconfig = {
    "OTHER_LDFLAGS" => "-lc++ -lresolv",
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++17",
    "HEADER_SEARCH_PATHS" => "\"$(PODS_ROOT)/Headers/Public/React-Core\""
  }
end
