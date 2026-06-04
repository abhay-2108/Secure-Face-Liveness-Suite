//! # Crypto Module
//!
//! Handles Ed25519 signatures, ChaCha20 encryption, and Anti-Spoofing security mechanisms.

use chacha20poly1305::{
    aead::{Aead, KeyInit},
    ChaCha20Poly1305, Key, Nonce,
};
use ed25519_dalek::{Signature, VerifyingKey};
use lazy_static::lazy_static;
use rand::rngs::OsRng;
use sha2::{Digest, Sha256};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

lazy_static! {
    static ref HARDWARE_FINGERPRINT: Mutex<Option<[u8; 32]>> = Mutex::new(None);
}

/// Injects a hardware-bound fingerprint derived from a device identifier.
///
/// This should be called from the platform layer (Android/iOS) before any
/// ledger encryption or sync operations are performed.
pub fn set_hardware_fingerprint_from_id(device_id: &str) {
    if device_id.trim().is_empty() {
        return;
    }

    let mut hasher = Sha256::new();
    hasher.update(device_id.as_bytes());
    let digest = hasher.finalize();

    let mut key = [0u8; 32];
    key.copy_from_slice(&digest[..32]);

    *HARDWARE_FINGERPRINT.lock().unwrap() = Some(key);
}

/// Prototype device fingerprint used for local ledger encryption.
///
/// Production builds must inject a real Android ID, hardware-backed key, or
/// platform keystore-derived secret before anti-cloning is claimed.
pub fn generate_hardware_fingerprint() -> [u8; 32] {
    if let Some(key) = *HARDWARE_FINGERPRINT.lock().unwrap() {
        return key;
    }

    let mut key = [0u8; 32];
    // Fallback for development builds when no device ID is injected.
    let mock_android_id = b"device-specific-hardware-uuid-99";
    for (i, &b) in mock_android_id.iter().enumerate() {
        if i < 32 {
            key[i] = b;
        }
    }
    key
}

/// Feature 7: Offline Time-Drift Protection (Anti-Tampering)
///
/// Field workers might manually change their device clock back 3 hours to fake attendance times.
/// We track the delta between the hardware monotonic clock (time since device boot)
/// and the Real-Time Clock (RTC). If the delta suddenly shifts by more than a few minutes,
/// we know the user has tampered with their clock while offline.
pub fn detect_time_tampering(last_rtc: u64, last_monotonic: u64, current_monotonic: u64) -> bool {
    let current_rtc = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let expected_rtc = last_rtc + (current_monotonic - last_monotonic);

    // If the actual RTC is off by more than 300 seconds (5 mins) from the expected monotonic progression,
    // they tampered with the device clock!
    if (current_rtc as i64 - expected_rtc as i64).abs() > 300 {
        return true; // Tampering detected!
    }

    false
}

/// Encrypt a payload using ChaCha20Poly1305 bound to the hardware fingerprint.
pub fn encrypt_ledger(payload: &[u8]) -> Vec<u8> {
    let key = Key::from(generate_hardware_fingerprint());
    let cipher = ChaCha20Poly1305::new(&key);
    let nonce = Nonce::from_slice(b"OpenFace-n-1"); // 12-bytes
    cipher.encrypt(nonce, payload).unwrap()
}

/// Verifies a cryptographic purge token from the AWS Lambda.
pub fn verify_purge_token(public_key_bytes: &[u8], message: &[u8], signature_bytes: &[u8]) -> bool {
    if let Ok(verifying_key) = VerifyingKey::from_bytes(public_key_bytes.try_into().unwrap()) {
        if let Ok(sig_bytes) = signature_bytes.try_into() {
            let signature = Signature::from_bytes(sig_bytes);
            return verifying_key.verify_strict(message, &signature).is_ok();
        }
    }
    false
}

use aes_gcm::{Aes256Gcm, Key as AesKey, Nonce as AesNonce};
use std::fs::File;
use std::io::Read;

/// Decrypts the ONNX file dynamically in memory.
pub fn load_and_decrypt_model(
    file_path: &str,
    encryption_key: &[u8; 32],
) -> Result<Vec<u8>, String> {
    // 1. Read encrypted bytes from local storage
    let mut file = File::open(file_path).map_err(|e| e.to_string())?;
    let mut encrypted_data = Vec::new();
    file.read_to_end(&mut encrypted_data)
        .map_err(|e| e.to_string())?;

    if encrypted_data.len() < 12 {
        return Err("Invalid encrypted file length".to_string());
    }

    // 2. Extract the 12-byte nonce (usually prepended to the file)
    let (nonce_bytes, cipher_bytes) = encrypted_data.split_at(12);
    let key = AesKey::<Aes256Gcm>::from_slice(encryption_key);
    let nonce = AesNonce::from_slice(nonce_bytes);
    let cipher = Aes256Gcm::new(key);

    // 3. Decrypt directly into a memory buffer
    let decrypted_bytes = cipher
        .decrypt(nonce, cipher_bytes)
        .map_err(|_| "Failed to decrypt model weights! Tampering detected.".to_string())?;

    // The decrypted_bytes vector can now be fed into tract-onnx
    Ok(decrypted_bytes)
}
