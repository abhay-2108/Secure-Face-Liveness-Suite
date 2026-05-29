#![allow(non_snake_case, dead_code, unused_imports, unused_variables)]

mod crypto;
mod hnsw_index;
mod ledger;
mod liveness;
mod memory_arena;
mod preprocessing;
mod sync;
mod thermal_governor;

use lazy_static::lazy_static;
use memory_arena::MemoryArena;
use preprocessing::Clahe;
use std::sync::Mutex;
use thermal_governor::{ThermalConfig, ThermalGovernor};
use tract_onnx::prelude::*;

#[cfg(target_os = "android")]
use jni::sys::jobject;
#[cfg(target_os = "android")]
use ndk_sys::{
    AAssetManager, AAssetManager_fromJava, AAssetManager_open, AAsset_getBuffer, AAsset_getLength,
    AASSET_MODE_BUFFER,
};

// Type alias for our loaded Tract model
type TractModel = SimplePlan<TypedFact, Box<dyn TypedOp>, Graph<TypedFact, Box<dyn TypedOp>>>;

lazy_static! {
    static ref ARENA: Mutex<MemoryArena> = Mutex::new(MemoryArena::with_default_size().unwrap());
    static ref GOVERNOR: Mutex<ThermalGovernor> = Mutex::new(ThermalGovernor::new(ThermalConfig::default()));

    // Globally cache our loaded Tract models
    static ref GHOST_NET: Mutex<Option<TractModel>> = Mutex::new(None);
    static ref LIVENESS_NET: Mutex<Option<TractModel>> = Mutex::new(None);
}

#[no_mangle]
pub extern "C" fn datalake_vision_init() -> i32 {
    let arena = ARENA.lock().unwrap();
    if arena.alloc(40 * 1024 * 1024).is_ok() {
        let gov = GOVERNOR.lock().unwrap();
        log::info!(
            "Thermal Governor Initialized. Target FPS: {}",
            gov.target_fps()
        );
        1
    } else {
        0
    }
}

/// Feature 10: Zero-Copy APK Memory Mapping (mmap)
#[cfg(target_os = "android")]
#[no_mangle]
pub extern "C" fn datalake_vision_load_model_zero_copy(
    env: *mut jni::sys::JNIEnv,
    asset_manager: jobject,
) -> i32 {
    unsafe {
        // 1. Extract the AAssetManager from the Java object
        let mgr = AAssetManager_fromJava(env as *mut _, asset_manager);
        if mgr.is_null() {
            log::error!("Failed to get AAssetManager from Java");
            return 0;
        }

        // Helper closure to load a model via zero-copy AAsset buffer
        let mut load_model = |filename: &str| -> Option<TractModel> {
            let c_filename = std::ffi::CString::new(filename).unwrap();
            let asset = AAssetManager_open(mgr, c_filename.as_ptr(), AASSET_MODE_BUFFER as i32);
            if asset.is_null() {
                log::error!("Asset not found: {}", filename);
                return None;
            }

            let length = AAsset_getLength(asset);
            let buffer = AAsset_getBuffer(asset);

            // Reconstruct the slice directly from the uncompressed APK memory
            let slice = std::slice::from_raw_parts(buffer as *const u8, length as usize);

            // Parse with Tract
            let mut cursor = std::io::Cursor::new(slice);
            let model = tract_onnx::onnx()
                .model_for_read(&mut cursor)
                .ok()?
                .into_optimized()
                .ok()?
                .into_runnable()
                .ok()?;

            Some(model)
        };

        // 2. Load GhostFaceNet and Liveness
        let mut ghost_guard = GHOST_NET.lock().unwrap();
        *ghost_guard = load_model("ghostfacenet.onnx");

        let mut live_guard = LIVENESS_NET.lock().unwrap();
        *live_guard = load_model("liveness.onnx");

        if ghost_guard.is_some() && live_guard.is_some() {
            log::info!("Zero-Copy ONNX models loaded successfully via AAssetManager!");
            1
        } else {
            log::error!("Failed to parse ONNX models");
            0
        }
    }
}

// Fallback for non-Android targets (e.g. iOS or Simulator testing)
#[cfg(not(target_os = "android"))]
#[no_mangle]
pub extern "C" fn datalake_vision_load_model_zero_copy(
    _asset_manager_ptr: *mut std::ffi::c_void,
) -> i32 {
    log::warn!("Zero-Copy loading is only supported on Android via NDK AAssetManager in this implementation.");
    0
}

/// Process a raw Y-plane camera frame through the full ML pipeline.
///
/// # Safety
///
/// - `y_ptr` must be a valid, non-null pointer to a buffer of at least `width * height` bytes.
/// - The buffer must remain valid and unmodified for the duration of this call.
/// - This function must not be called concurrently from multiple threads with the same buffer.
#[no_mangle]
pub unsafe extern "C" fn datalake_vision_process_frame(
    y_ptr: *mut u8,
    width: i32,
    height: i32,
) -> i32 {
    if y_ptr.is_null() {
        return -1;
    }

    // Feature 9: Thermal Throttling Check
    {
        let mut gov = GOVERNOR.lock().unwrap();
        if !gov.should_process_frame() {
            return 2; // Throttled Frame
        }
    }

    let size = (width * height) as usize;
    let y_slice = unsafe { std::slice::from_raw_parts_mut(y_ptr, size) };

    // 1. Preprocessing (CLAHE + SIMD)
    let clahe = Clahe::new(2.0, 8, 8);
    clahe.apply_in_place(y_slice, width as usize, height as usize);

    // 2. Liveness Detection
    let is_live = liveness::check_liveness(y_slice, width as usize, height as usize);
    if !is_live {
        return -2; // Spoof Detected
    }

    // 3. Optional: Tract ONNX Inference Demo (In real deployment, we'd feed resized crops here)
    // let ghost = GHOST_NET.lock().unwrap();
    // if let Some(model) = ghost.as_ref() {
    //      let tensor: tract_ndarray::Array4<f32> = ... ; // convert y_slice to 1x3x112x112 tensor
    //      let result = model.run(tvec!(tensor.into_tvec().into())).unwrap();
    // }

    1 // Success
}
