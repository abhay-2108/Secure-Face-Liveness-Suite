# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# Camera extensions (optional)
-dontwarn androidx.camera.extensions.**

# React Native core rules
-keep class com.facebook.react.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.react.modules.** { *; }
-keep class com.facebook.react.bridge.** { *; }

# Hermes rules
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.hermes.reactexecutor.** { *; }
-keep class com.facebook.react.hermes.** { *; }

# JSI and native modules
-keepclasseswithmembers class * {
    native <methods>;
}

# Keep native modules that use reflection
-keepclasseswithmembers class com.facebook.react.** {
    *** *(...);
}

# Vision Camera rules (critical for native module initialization)
-keep class com.mrousavy.camera.** { *; }
-keep class com.mrousavy.camera.frameprocessor.** { *; }

# Reanimated rules
-keep class com.swmansion.reanimated.** { *; }

# Worklets
-keep class com.swmansion.worklets.** { *; }

# Exception handling for reflection
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Keep all reflection-related classes
-keepclasseswithmembers class * {
    *** *(...);
}

# Additional warnings to suppress for optional dependencies
-dontwarn java.lang.invoke.**
-dontwarn sun.misc.Unsafe
