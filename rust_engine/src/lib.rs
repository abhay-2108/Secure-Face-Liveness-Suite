#![allow(
    non_snake_case,
    dead_code,
    unused_imports,
    unused_variables,
    clippy::not_unsafe_ptr_arg_deref,
    clippy::missing_safety_doc
)]

mod crypto;
mod hnsw_index;
mod ledger;
mod liveness;
mod memory_arena;
mod preprocessing;
mod sync;
mod thermal_governor;

use hnsw_index::HNSWGraph;
use lazy_static::lazy_static;
use ledger::Ledger;
use memory_arena::MemoryArena;
use preprocessing::Clahe;
use std::sync::Mutex;
use std::time::Instant;
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

/// Runtime configuration parsed from the JS bridge
#[derive(Clone)]
struct EngineConfig {
    arena_size: usize,
    model_path: String,
    hnsw_index_path: String,
    ledger_db_path: String,
    clahe_clip_limit: f64,
    inference_threads: usize,
    match_threshold: f64,
    liveness_threshold: f64,
    offline_mode: bool,
}

impl Default for EngineConfig {
    fn default() -> Self {
        Self {
            arena_size: 40,
            model_path: String::new(),
            hnsw_index_path: String::new(),
            ledger_db_path: String::from("/data/data/com.OpenFace.example/files/ledger.bin"),
            clahe_clip_limit: 2.0,
            inference_threads: 2,
            match_threshold: 0.68,
            liveness_threshold: 0.85,
            offline_mode: true,
        }
    }
}

lazy_static! {
    static ref ARENA: Mutex<MemoryArena> = Mutex::new(MemoryArena::with_default_size().unwrap());
    static ref GOVERNOR: Mutex<ThermalGovernor> = Mutex::new(ThermalGovernor::new(ThermalConfig::default()));

    // Globally cache our loaded Tract models
    static ref GHOST_NET: Mutex<Option<TractModel>> = Mutex::new(None);
    static ref LIVENESS_NET: Mutex<Option<TractModel>> = Mutex::new(None);

    // HNSW vector database for identity search
    static ref HNSW: Mutex<HNSWGraph> = Mutex::new(HNSWGraph::new(100_000, 16, 200));

    // Encrypted ledger for offline-first event storage
    static ref LEDGER: Mutex<Option<Ledger>> = Mutex::new(None);

    // Runtime config
    static ref CONFIG: Mutex<EngineConfig> = Mutex::new(EngineConfig::default());

    // Engine state
    static ref INITIALIZED: Mutex<bool> = Mutex::new(false);

    // Accumulated metrics
    static ref METRICS: Mutex<EngineMetricsInternal> = Mutex::new(EngineMetricsInternal::default());
}

#[derive(Default, Clone)]
struct EngineMetricsInternal {
    arena_locked_mb: f64,
    model_size_mb: f64,
    hnsw_latency_ms: f64,
    inference_latency_ms: f64,
    detection_latency_ms: f64,
    liveness_latency_ms: f64,
    recognition_latency_ms: f64,
    preprocess_latency_ms: f64,
    sync_status: String,
    index_size: usize,
}

// ============================================================================
// FFI: Initialize the engine with a JSON config from JS
// ============================================================================
#[no_mangle]
pub extern "C" fn open_face_initialize(
    config_json: *const std::os::raw::c_char,
) -> *mut std::os::raw::c_char {
    let config_str = unsafe {
        if config_json.is_null() {
            return make_json_error("Null config pointer");
        }
        std::ffi::CStr::from_ptr(config_json)
            .to_string_lossy()
            .to_string()
    };

    // Parse the config JSON
    let parsed: serde_json::Value = match serde_json::from_str(&config_str) {
        Ok(v) => v,
        Err(e) => return make_json_error(&format!("Config parse error: {}", e)),
    };

    let mut cfg = CONFIG.lock().unwrap();
    cfg.arena_size = parsed["arena_size"].as_u64().unwrap_or(40) as usize;
    cfg.model_path = parsed["model_path"].as_str().unwrap_or("").to_string();
    cfg.hnsw_index_path = parsed["hnsw_index_path"].as_str().unwrap_or("").to_string();
    cfg.ledger_db_path = parsed["ledger_db_path"].as_str().unwrap_or("").to_string();
    cfg.clahe_clip_limit = parsed["clahe_clip_limit"].as_f64().unwrap_or(2.0);
    cfg.inference_threads = parsed["inference_threads"].as_u64().unwrap_or(2) as usize;
    cfg.match_threshold = parsed["match_threshold"].as_f64().unwrap_or(0.68);
    cfg.liveness_threshold = parsed["liveness_threshold"].as_f64().unwrap_or(0.85);
    cfg.offline_mode = parsed["offline_mode"].as_bool().unwrap_or(true);

    // Allocate memory arena
    let arena = ARENA.lock().unwrap();
    let arena_bytes = cfg.arena_size * 1024 * 1024;
    let _ = arena.alloc(arena_bytes);

    // Initialize thermal governor
    let gov = GOVERNOR.lock().unwrap();
    log::info!(
        "Thermal Governor Initialized. Target FPS: {}",
        gov.target_fps()
    );

    // Initialize ledger if path is provided
    if !cfg.ledger_db_path.is_empty() {
        let mut ledger_guard = LEDGER.lock().unwrap();
        *ledger_guard = Some(Ledger::new(&cfg.ledger_db_path));
    }

    // Update metrics
    {
        let mut m = METRICS.lock().unwrap();
        m.arena_locked_mb = cfg.arena_size as f64;
        m.sync_status = if cfg.offline_mode {
            "offline".to_string()
        } else {
            "synced".to_string()
        };
        m.index_size = HNSW.lock().unwrap().nodes.len();
    }

    // Mark initialized
    *INITIALIZED.lock().unwrap() = true;

    make_json_success()
}

// ============================================================================
// FFI: Legacy init (kept for backward compatibility with existing JNI)
// ============================================================================
#[no_mangle]
pub extern "C" fn open_face_init() -> i32 {
    let arena = ARENA.lock().unwrap();
    if arena.alloc(40 * 1024 * 1024).is_ok() {
        let gov = GOVERNOR.lock().unwrap();
        log::info!(
            "Thermal Governor Initialized. Target FPS: {}",
            gov.target_fps()
        );
        *INITIALIZED.lock().unwrap() = true;
        1
    } else {
        0
    }
}

// ============================================================================
// FFI: Search identity in HNSW vector database
// ============================================================================
#[no_mangle]
pub extern "C" fn open_face_search_identity(
    embedding_json: *const std::os::raw::c_char,
) -> *mut std::os::raw::c_char {
    let json_str = unsafe {
        if embedding_json.is_null() {
            return make_json_error("Null embedding pointer");
        }
        std::ffi::CStr::from_ptr(embedding_json)
            .to_string_lossy()
            .to_string()
    };

    let embedding_vec: Vec<f32> = match serde_json::from_str(&json_str) {
        Ok(v) => v,
        Err(e) => return make_json_error(&format!("Embedding parse error: {}", e)),
    };

    if embedding_vec.len() != 128 {
        return make_json_error(&format!(
            "Expected 128-dim embedding, got {}",
            embedding_vec.len()
        ));
    }

    let mut embedding = [0.0f32; 128];
    embedding.copy_from_slice(&embedding_vec);

    let start = Instant::now();
    let hnsw = HNSW.lock().unwrap();
    let results = hnsw.search(&embedding, 1);
    let search_ms = start.elapsed().as_secs_f64() * 1000.0;

    // Update metrics
    METRICS.lock().unwrap().hnsw_latency_ms = search_ms;

    let cfg = CONFIG.lock().unwrap();
    let threshold = cfg.match_threshold;

    let result_json = if let Some((id, similarity)) = results.first() {
        if *similarity >= threshold as f32 {
            format!(
                r#"{{"matched":true,"similarity":{:.4},"identityId":"{}","identityLabel":"{}","searchLatencyMs":{:.2}}}"#,
                similarity, id, id, search_ms
            )
        } else {
            format!(
                r#"{{"matched":false,"similarity":{:.4},"identityId":"","identityLabel":"","searchLatencyMs":{:.2}}}"#,
                similarity, search_ms
            )
        }
    } else {
        format!(
            r#"{{"matched":false,"similarity":0.0,"identityId":"","identityLabel":"","searchLatencyMs":{:.2}}}"#,
            search_ms
        )
    };

    make_c_string(&result_json)
}

// ============================================================================
// FFI: Enroll a new identity
// ============================================================================
#[no_mangle]
pub extern "C" fn open_face_enroll_identity(
    label: *const std::os::raw::c_char,
    embedding_json: *const std::os::raw::c_char,
) -> *mut std::os::raw::c_char {
    let label_str = unsafe {
        if label.is_null() {
            return make_json_error("Null label");
        }
        std::ffi::CStr::from_ptr(label)
            .to_string_lossy()
            .to_string()
    };

    let json_str = unsafe {
        if embedding_json.is_null() {
            return make_json_error("Null embedding");
        }
        std::ffi::CStr::from_ptr(embedding_json)
            .to_string_lossy()
            .to_string()
    };

    let embedding_vec: Vec<f32> = match serde_json::from_str(&json_str) {
        Ok(v) => v,
        Err(e) => return make_json_error(&format!("Parse error: {}", e)),
    };

    if embedding_vec.len() != 128 {
        return make_json_error("Expected 128-dim embedding");
    }

    let mut embedding = [0.0f32; 128];
    embedding.copy_from_slice(&embedding_vec);

    let identity_id = uuid::Uuid::new_v4().to_string();

    let mut hnsw = HNSW.lock().unwrap();
    match hnsw.insert(identity_id.clone(), embedding) {
        Ok(_) => {
            // Also write to ledger if available
            if let Some(ref ledger) = *LEDGER.lock().unwrap() {
                let event = ledger::AttendanceEvent {
                    event_id: uuid::Uuid::new_v4().to_string(),
                    user_id: identity_id.clone(),
                    timestamp: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs(),
                    latitude: 0.0,
                    longitude: 0.0,
                    embedding_hash: format!(
                        "{:x}",
                        embedding_vec.iter().map(|x| *x as u32).sum::<u32>()
                    ),
                    encrypted_payload: String::new(),
                    signature: String::new(),
                };
                let _ = ledger.append_event(&event);
            }

            METRICS.lock().unwrap().index_size = hnsw.nodes.len();

            let json = format!(r#"{{"success":true,"identityId":"{}"}}"#, identity_id);
            make_c_string(&json)
        }
        Err(e) => {
            let json = format!(r#"{{"success":false,"identityId":"","error":"{}"}}"#, e);
            make_c_string(&json)
        }
    }
}

// ============================================================================
// FFI: Get sync status
// ============================================================================
#[no_mangle]
pub extern "C" fn open_face_get_sync_status() -> *mut std::os::raw::c_char {
    let ledger_guard = LEDGER.lock().unwrap();
    let (pending, total) = if let Some(ref ledger) = *ledger_guard {
        let events = ledger.read_all_events().unwrap_or_default();
        (events.len(), events.len())
    } else {
        (0, 0)
    };

    let cfg = CONFIG.lock().unwrap();
    let mode = if cfg.offline_mode {
        "offline"
    } else {
        "synced"
    };

    let json = format!(
        r#"{{"pendingCount":{},"syncedCount":0,"totalCount":{},"isConnected":{},"lastSyncTimestamp":null,"mode":"{}"}}"#,
        pending, total, !cfg.offline_mode, mode
    );
    make_c_string(&json)
}

// ============================================================================
// FFI: Get engine metrics
// ============================================================================
#[no_mangle]
pub extern "C" fn open_face_get_metrics() -> *mut std::os::raw::c_char {
    let m = METRICS.lock().unwrap();
    let json = format!(
        r#"{{"arenaLockedMb":{:.1},"modelSizeMb":{:.1},"hnswLatencyMs":{:.2},"inferenceLatencyMs":{:.2},"detectionLatencyMs":{:.2},"livenessLatencyMs":{:.2},"recognitionLatencyMs":{:.2},"preprocessLatencyMs":{:.2},"syncStatus":"{}","indexSize":{}}}"#,
        m.arena_locked_mb,
        m.model_size_mb,
        m.hnsw_latency_ms,
        m.inference_latency_ms,
        m.detection_latency_ms,
        m.liveness_latency_ms,
        m.recognition_latency_ms,
        m.preprocess_latency_ms,
        m.sync_status,
        m.index_size
    );
    make_c_string(&json)
}

// ============================================================================
// FFI: Force purge the local ledger
// ============================================================================
#[no_mangle]
pub extern "C" fn open_face_force_purge() -> *mut std::os::raw::c_char {
    let ledger_guard = LEDGER.lock().unwrap();
    if let Some(ref ledger) = *ledger_guard {
        let count = ledger.read_all_events().unwrap_or_default().len();
        match ledger.truncate_purge() {
            Ok(_) => {
                let json = format!(
                    r#"{{"success":true,"purgedCount":{},"remainingCount":0}}"#,
                    count
                );
                make_c_string(&json)
            }
            Err(e) => make_json_error(&format!("Purge failed: {}", e)),
        }
    } else {
        make_c_string(r#"{"success":true,"purgedCount":0,"remainingCount":0}"#)
    }
}

// ============================================================================
// FFI: Trigger sync (no-op in offline mode, signals JS layer to handle HTTP)
// ============================================================================
#[no_mangle]
pub extern "C" fn open_face_trigger_sync() {
    let cfg = CONFIG.lock().unwrap();
    if cfg.offline_mode {
        log::info!("Sync trigger ignored — offline mode is active");
    } else {
        let mut m = METRICS.lock().unwrap();
        m.sync_status = "syncing".to_string();
        log::info!("Sync triggered — JS layer should execute HTTP sync");
    }
}

// ============================================================================
// FFI: Shutdown and release resources
// ============================================================================
#[no_mangle]
pub extern "C" fn open_face_shutdown() {
    *INITIALIZED.lock().unwrap() = false;
    *GHOST_NET.lock().unwrap() = None;
    *LIVENESS_NET.lock().unwrap() = None;
    *LEDGER.lock().unwrap() = None;
    log::info!("Engine shutdown complete. All resources released.");
}

// ============================================================================
// FFI: Zero-Copy APK Memory Mapping (mmap) — Android only
// ============================================================================
#[cfg(target_os = "android")]
#[no_mangle]
pub extern "C" fn open_face_load_model_zero_copy(
    env: *mut jni::sys::JNIEnv,
    asset_manager: jobject,
) -> i32 {
    unsafe {
        let mgr = AAssetManager_fromJava(env as *mut _, asset_manager);
        if mgr.is_null() {
            log::error!("Failed to get AAssetManager from Java");
            return 0;
        }

        let mut load_model = |filename: &str| -> Option<TractModel> {
            let c_filename = std::ffi::CString::new(filename).unwrap();
            let asset = AAssetManager_open(mgr, c_filename.as_ptr(), AASSET_MODE_BUFFER as i32);
            if asset.is_null() {
                log::error!("Asset not found: {}", filename);
                return None;
            }

            let length = AAsset_getLength(asset);
            let buffer = AAsset_getBuffer(asset);

            let slice = std::slice::from_raw_parts(buffer as *const u8, length as usize);

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

        let mut ghost_guard = GHOST_NET.lock().unwrap();
        *ghost_guard = load_model("ghostfacenet.onnx");

        let mut live_guard = LIVENESS_NET.lock().unwrap();
        *live_guard = load_model("liveness.onnx");

        if ghost_guard.is_some() && live_guard.is_some() {
            // Update model size metric
            METRICS.lock().unwrap().model_size_mb = 6.6;
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
pub extern "C" fn open_face_load_model_zero_copy(_asset_manager_ptr: *mut std::ffi::c_void) -> i32 {
    log::warn!("Zero-Copy loading is only supported on Android via NDK AAssetManager in this implementation.");
    0
}

// ============================================================================
// FFI: Process a raw Y-plane camera frame through the full ML pipeline
// ============================================================================
///
/// # Safety
///
/// - `y_ptr` must be a valid, non-null pointer to a buffer of at least `width * height` bytes.
/// - The buffer must remain valid and unmodified for the duration of this call.
/// - This function must not be called concurrently from multiple threads with the same buff#[no_mangle]
pub unsafe extern "C" fn open_face_process_frame(
    y_ptr: *mut u8,
    width: i32,
    height: i32,
    stride: i32,
    flash_state: i32,
) -> *mut std::os::raw::c_char {
    if y_ptr.is_null() {
        let err_json =
            std::ffi::CString::new(r#"{"faceDetected":false,"error":"Null frame buffer"}"#)
                .unwrap();
        return err_json.into_raw();
    }

    // Thermal Throttling Check
    {
        let mut gov = GOVERNOR.lock().unwrap();
        if !gov.should_process_frame() {
            let throttled_json = std::ffi::CString::new(
                r#"{"faceDetected":false,"error":"Thermal Throttling Active"}"#,
            )
            .unwrap();
            return throttled_json.into_raw();
        }
    }

    let total_start = Instant::now();
    let size = (width * height) as usize;
    let y_slice = std::slice::from_raw_parts_mut(y_ptr, size);

    // 1. Preprocessing (CLAHE)
    let preprocess_start = Instant::now();
    let cfg = CONFIG.lock().unwrap();
    let clahe = Clahe::new(cfg.clahe_clip_limit as f32, 8, 8);
    drop(cfg);
    clahe.apply_in_place(y_slice, width as usize, height as usize);
    let preprocess_ms = preprocess_start.elapsed().as_secs_f64() * 1000.0;

    // 2. Liveness Detection (Consolidated Zero-ML suite)
    let liveness_start = Instant::now();
    
    // Feature 5: Laplacian texture
    let variance = liveness::calculate_laplacian_variance(y_slice, width as usize, height as usize);
    let texture_passed = variance >= 50.0;

    // Feature 2: FFT Moire Detection
    let (moire_passed, moire_score) = liveness::detect_moire_patterns(y_slice, width as usize, height as usize);

    // Feature 3: Sparse Lucas-Kanade Jitter tracking
    let (jitter_passed, jitter_score) = liveness::track_jitter_optical_flow(y_slice, width as usize, height as usize);

    // Feature 1: Screen Flash reflection analysis
    let (flash_passed, flash_score) = if flash_state > 0 {
        liveness::process_screen_flash(y_slice, width as usize, height as usize, flash_state)
    } else {
        (true, 1.0)
    };

    let is_live = texture_passed && moire_passed && jitter_passed && flash_passed;
    let liveness_ms = liveness_start.elapsed().as_secs_f64() * 1000.0;

    // Sensor Fusion Liveness Score
    let texture_score = (variance / 1000.0).min(1.0);
    let liveness_score = (texture_score * 0.2 + moire_score * 0.3 + jitter_score * 0.3 + flash_score * 0.2)
        .min(1.0)
        .max(0.0);

    // 3. Determine liveness status and challenge
    let cfg = CONFIG.lock().unwrap();
    let liveness_threshold = cfg.liveness_threshold;
    let match_threshold = cfg.match_threshold;
    drop(cfg);

    // If flash sequence is in-progress (state == 1), we don't declare passed/failed yet
    let liveness_passed = is_live && liveness_score >= liveness_threshold && flash_state != 1;

    // 4. HNSW Search (only if liveness passed) — uses dummy embedding for now
    let (match_json, hnsw_ms) = if liveness_passed {
        let search_start = Instant::now();
        let hnsw = HNSW.lock().unwrap();
        let dummy_embedding = [0.0f32; 128]; // Will be replaced by Tract output
        let results = hnsw.search(&dummy_embedding, 1);
        let elapsed = search_start.elapsed().as_secs_f64() * 1000.0;

        if let Some((id, similarity)) = results.first() {
            if *similarity >= match_threshold as f32 {
                (
                    format!(
                        r#","match":{{"matched":true,"similarity":{:.4},"identityId":"{}","identityLabel":"{}","searchLatencyMs":{:.2}}}"#,
                        similarity, id, id, elapsed
                    ),
                    elapsed,
                )
            } else {
                (
                    format!(
                        r#","match":{{"matched":false,"similarity":{:.4},"identityId":"","identityLabel":"","searchLatencyMs":{:.2}}}"#,
                        similarity, elapsed
                    ),
                    elapsed,
                )
            }
        } else {
            (
                format!(
                    r#","match":{{"matched":false,"similarity":0.0,"identityId":"","identityLabel":"","searchLatencyMs":{:.2}}}"#,
                    elapsed
                ),
                elapsed,
            )
        }
    } else {
        (r#","match":null"#.to_string(), 0.0)
    };

    let total_ms = total_start.elapsed().as_secs_f64() * 1000.0;

    // Update accumulated metrics
    {
        let mut m = METRICS.lock().unwrap();
        m.preprocess_latency_ms = preprocess_ms;
        m.liveness_latency_ms = liveness_ms;
        m.hnsw_latency_ms = hnsw_ms;
        m.inference_latency_ms = total_ms;
    }

    // Build the full FrameResult JSON
    let json_str = format!(
        r#"{{"faceDetected":true,"boundingBox":null,"liveness":{{"isReal":{},"silentScore":{:.4},"opticalFlowPassed":{},"blinkDetected":false,"status":"{}","currentChallenge":"{}","challengeProgress":{},"reflectionPassed":{},"moirePassed":{},"jitterPassed":{}}},"embedding":[]{},"totalLatencyMs":{:.2},"metrics":{{"preprocessLatencyMs":{:.2},"livenessLatencyMs":{:.2},"hnswLatencyMs":{:.2},"inferenceLatencyMs":{:.2}}}}}"#,
        is_live,
        liveness_score,
        jitter_passed,
        if liveness_passed {
            "passed"
        } else if flash_state == 1 {
            "pending"
        } else {
            "in_progress"
        },
        if !is_live {
            if !flash_passed {
                "screen_flash"
            } else {
                "hold_still"
            }
        } else if !liveness_passed {
            "none"
        } else {
            "none"
        },
        if liveness_passed {
            1.0
        } else {
            liveness_score
        },
        flash_passed,
        moire_passed,
        jitter_passed,
        match_json,
        total_ms,
        preprocess_ms,
        liveness_ms,
        hnsw_ms,
        total_ms,
    );

    let result = std::ffi::CString::new(json_str).unwrap();
    result.into_raw()
}

// ============================================================================
// FFI: Free a Rust-allocated string
// ============================================================================
#[no_mangle]
pub unsafe extern "C" fn open_face_free_string(s: *mut std::os::raw::c_char) {
    if !s.is_null() {
        let _ = std::ffi::CString::from_raw(s);
    }
}

// ============================================================================
// Helper functions
// ============================================================================
fn make_c_string(s: &str) -> *mut std::os::raw::c_char {
    std::ffi::CString::new(s).unwrap().into_raw()
}

fn make_json_error(msg: &str) -> *mut std::os::raw::c_char {
    let json = format!(r#"{{"success":false,"error":"{}"}}"#, msg);
    make_c_string(&json)
}

fn make_json_success() -> *mut std::os::raw::c_char {
    make_c_string(r#"{"success":true}"#)
}
