Pod::Spec.new do |s|
  s.name         = "OpenFace"
  s.version      = "0.1.0"
  s.summary      = "Edge AI facial recognition and liveness detection for React Native"
  s.description  = <<-DESC
    React Native native module wrapping the OpenFace 3.0 Rust engine.
    Provides face detection, silent + active liveness verification,
    128-d embedding extraction, HNSW vector search, and offline-first
    encrypted identity management — all running on-device.
  DESC
  s.homepage     = "https://github.com/abhay-2108/Secure-Face-Liveness-Suite"
  s.license      = { :type => "MIT", :file => "../LICENSE" }
  s.author       = { "Aegis Team" => "" }
  s.platform     = :ios, "12.0"
  s.source       = { :git => "https://github.com/abhay-2108/Secure-Face-Liveness-Suite.git", :tag => s.version }

  s.source_files = "*.{h,m,mm}"
  
  # Pre-built Rust static library (cross-compiled via cargo-lipo)
  s.vendored_libraries = "libOpenFace_engine.a"
  
  s.dependency "React-Core"
  
  # Required for linking the Rust static library
  s.pod_target_xcconfig = {
    "OTHER_LDFLAGS" => "-lc++ -lresolv",
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++17",
    "HEADER_SEARCH_PATHS" => "\"$(PODS_ROOT)/Headers/Public/React-Core\""
  }
end
