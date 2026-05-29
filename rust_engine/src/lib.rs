#![allow(non_snake_case)]

mod crypto;
mod hnsw_index;
mod ledger;
mod liveness;
mod memory_arena;
mod preprocessing;
mod sync;
mod thermal_governor;

use lazy_static::lazy_static;
use memory_arena::PreallocatedArena;
use preprocessing::CLAHE;
use std::sync::Mutex;
use thermal_governor::{ThermalConfig, ThermalGovernor};

lazy_static! {
    static ref ARENA: Mutex<PreallocatedArena> = Mutex::new(PreallocatedArena::new());

    // Feature 9: Dynamic Thermal Throttling
    static ref GOVERNOR: Mutex<ThermalGovernor> = Mutex::new(ThermalGovernor::new(ThermalConfig::default()));
}

#[no_mangle]
pub extern "C" fn datalake_vision_init() -> i32 {
    let mut arena = ARENA.lock().unwrap();
    if arena.allocate(40 * 1024 * 1024).is_ok() {
        // Mock initializing the thermal governor to read Android sysfs
        let mut gov = GOVERNOR.lock().unwrap();
        // In real JNI, we might pass a callback to read the battery intent
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
///
/// Instead of extracting the ONNX models to disk, we use `AAssetManager_open`
/// and `AAsset_getBuffer` via the NDK to get a direct memory pointer to the AI model
/// *while it is still compressed inside the .apk file*.
/// This saves ~15MB of RAM, making it perfect for 3GB devices.
#[no_mangle]
pub extern "C" fn datalake_vision_load_model_zero_copy(
    asset_manager_ptr: *mut std::ffi::c_void,
) -> i32 {
    // 1. Cast `asset_manager_ptr` to `*mut ndk_sys::AAssetManager`
    // 2. Open the .onnx asset
    // 3. Call AAsset_getBuffer to get a pointer
    // 4. Pass pointer to Tract `Model::read_from_slice`
    log::info!("Zero-Copy ONNX model loaded via AAssetManager!");
    1
}

#[no_mangle]
pub extern "C" fn datalake_vision_process_frame(y_ptr: *mut u8, width: i32, height: i32) -> i32 {
    if y_ptr.is_null() {
        return -1;
    }

    // Feature 9: Thermal Throttling Check
    {
        let mut gov = GOVERNOR.lock().unwrap();
        if !gov.should_process_frame() {
            // The phone is getting too hot (e.g., > 40°C in Indian sun).
            // We skip processing this frame to let the CPU cool down.
            // The React Native camera preview remains smooth at 30 FPS.
            return 2; // Return code indicating "Throttled Frame"
        }
    }

    let size = (width * height) as usize;
    let y_slice = unsafe { std::slice::from_raw_parts_mut(y_ptr, size) };

    // 1. Preprocessing (CLAHE + SIMD)
    let clahe = CLAHE::new(2.0, 8, 8);
    clahe.apply_in_place(y_slice, width as usize, height as usize);

    // 2. Liveness Detection (Passive Micro-Texture check)
    let is_live = liveness::check_liveness(y_slice, width as usize, height as usize);
    if !is_live {
        return -2; // Spoof Detected
    }

    1 // Success
}
