//! # Crypto Module
//!
//! Handles Ed25519 signatures, ChaCha20 encryption, and Anti-Spoofing security mechanisms.

use chacha20poly1305::{
    aead::{Aead, KeyInit},
    ChaCha20Poly1305, Key, Nonce,
};
use ed25519_dalek::{Signature, VerifyingKey};
use rand::rngs::OsRng;
use std::time::{SystemTime, UNIX_EPOCH};

/// Feature 6: Device Hardware Fingerprinting (Anti-Cloning)
///
/// Binds the offline ledger cryptographically to the physical phone.
/// In a real deployment, this queries the Android ID, CPU Serial, or Secure Enclave.
/// If an attacker steals the encrypted CRDT ledger file and tries to load it on an emulator,
/// the hardware fingerprint won't match, and the file decrypts to garbage.
pub fn generate_hardware_fingerprint() -> [u8; 32] {
    let mut key = [0u8; 32];
    // Mocking the JNI call to android.provider.Settings.Secure.ANDROID_ID
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
    let nonce = Nonce::from_slice(b"datalake-n-1"); // 12-bytes
    cipher.encrypt(&nonce, payload).unwrap()
}

/// Verifies a cryptographic purge token from the AWS Lambda.
pub fn verify_purge_token(public_key_bytes: &[u8], message: &[u8], signature_bytes: &[u8]) -> bool {
    if let Ok(verifying_key) = VerifyingKey::from_bytes(public_key_bytes.try_into().unwrap()) {
        if let Ok(signature) = Signature::from_bytes(signature_bytes.try_into().unwrap()) {
            return verifying_key.verify_strict(message, &signature).is_ok();
        }
    }
    false
}
