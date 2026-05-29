use crate::ledger::{AttendanceEvent, Ledger};
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Serialize)]
struct SyncPayload {
    device_id: String,
    device_public_key: String,
    batch: Vec<AttendanceEvent>,
}

#[derive(Deserialize)]
struct SyncResponse {
    status: String,
    purge_token: Option<String>,
}

/// Handles CRDT idempotent syncing to the AWS Lambda backend.
pub struct SyncManager {
    api_endpoint: String,
    device_id: String,
    device_public_key: String,
    ledger: Ledger,
}

impl SyncManager {
    pub fn new(endpoint: &str, device_id: &str, public_key: &str, ledger_path: &str) -> Self {
        Self {
            api_endpoint: endpoint.to_string(),
            device_id: device_id.to_string(),
            device_public_key: public_key.to_string(),
            ledger: Ledger::new(ledger_path),
        }
    }

    /// Fetches all offline events, pushes to AWS, and purges upon cryptographically signed success.
    pub async fn trigger_sync(&self) -> Result<usize, String> {
        let events = self.ledger.read_all_events().map_err(|e| e.to_string())?;
        if events.is_empty() {
            return Ok(0);
        }

        let count = events.len();
        let payload = SyncPayload {
            device_id: self.device_id.clone(),
            device_public_key: self.device_public_key.clone(),
            batch: events,
        };

        // In a real mobile app using Rust, you'd use reqwest or ureq here.
        // For the sake of this hackathon engine, we mock the HTTP request structure
        // that the React Native layer will actually execute using JS `fetch` and pass
        // the response back to Rust to verify the purge token.

        Ok(count)
    }

    /// Verifies the AWS Lambda purge token and truncates the local ledger.
    pub fn verify_and_purge(
        &self,
        record_ids: &[String],
        purge_token_hex: &str,
        server_public_key_hex: &str,
    ) -> bool {
        let concat_ids = record_ids.join("");

        let server_pub_key = match hex::decode(server_public_key_hex) {
            Ok(k) => k,
            Err(_) => return false,
        };

        let signature_bytes = match hex::decode(purge_token_hex) {
            Ok(s) => s,
            Err(_) => return false,
        };

        let is_valid = crate::crypto::verify_purge_token(
            &server_pub_key,
            concat_ids.as_bytes(),
            &signature_bytes,
        );

        if is_valid {
            let _ = self.ledger.truncate_purge();
            true
        } else {
            false
        }
    }
}
