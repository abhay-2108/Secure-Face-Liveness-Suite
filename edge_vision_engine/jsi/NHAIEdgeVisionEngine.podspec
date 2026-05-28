Pod::Spec.new do |s|
  s.name         = "NHAIEdgeVisionEngine"
  s.version      = "1.0.0"
  s.summary      = "NHAI Toll Booth Edge AI C++ JSI Face Engine"
  s.description  = <<-DESC
                   Highly optimized C++ JSI engine for direct memory camera processing
                   incorporating CLAHE preprocessors and quantized TFLite inference models.
                   DESC
  s.homepage     = "https://github.com/raj0120"
  s.license      = "Proprietary"
  s.authors      = { "NHAI Edge AI Developers" => "raj0120" }
  s.platforms    = { :ios => "12.0" }
  s.source       = { :git => "" }

  # Include JSI sources and preprocessing C++ algorithms
  s.source_files = "**/*.{h,cpp,mm}", "../preprocessing/*.{h,cpp}"
  s.header_dir   = "NHAIEdgeVisionEngine"

  # Compiler optimization flag configuration for iOS builds
  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++17",
    "CLANG_CXX_LIBRARY" => "libc++",
    "OTHER_CPLUSPLUSFLAGS" => "-O3 -ffast-math -funroll-loops -DNDEBUG"
  }

  # Link core React Native JSI dependencies and TensorFlow Lite runtime
  s.dependency "React-Core"
  s.dependency "React-jsi"
  s.dependency "TensorFlowLiteC"
end
