require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "react-native-datalake-vision"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => "12.0" }
  s.source       = { :git => "https://github.com/datalake-vision/react-native-datalake-vision.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,cpp}"

  # Link against the pre-compiled Rust static library (.a)
  # The teammate will compile the Rust engine into this folder using cargo-lipo or cargo build --target aarch64-apple-ios
  s.vendored_libraries = 'ios/libs/libdatalake_engine.a'

  s.dependency "React-Core"
  s.dependency "VisionCamera"
  
  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++17",
    "HEADER_SEARCH_PATHS" => "\"$(PODS_ROOT)/Headers/Public/React-Core\" \"$(PODS_ROOT)/Headers/Public/VisionCamera\"",
    # Important: Tell Xcode to link the Rust library properly
    "OTHER_LDFLAGS" => "-force_load \"${PODS_TARGET_SRCROOT}/ios/libs/libdatalake_engine.a\"",
    "ENABLE_BITCODE" => "NO" # Rust libraries usually don't support Bitcode
  }
end
