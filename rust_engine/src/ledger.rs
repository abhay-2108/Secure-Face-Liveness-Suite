use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::io::{Read, Write, Seek, SeekFrom};
use std::path::Path;
use uuid::Uuid;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AttendanceEvent {
    pub event_id: String,
    pub user_id: String,
    pub timestamp: u64,
    pub latitude: f64,
    pub longitude: f64,
    pub embedding_hash: String,
    pub encrypted_payload: String, // Base64
    pub signature: String, // Hex
}

/// Manages an append-only binary log of offline events.
/// This replaces the heavy SQLite database for O(1) writes.
pub struct Ledger {
    file_path: String,
}

impl Ledger {
    pub fn new(path: &str) -> Self {
        Self {
            file_path: path.to_string(),
        }
    }

    pub fn append_event(&self, event: &AttendanceEvent) -> std::io::Result<()> {
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.file_path)?;

        let serialized = bincode::serialize(event).unwrap();
        // Write size header
        let size = serialized.len() as u32;
        file.write_all(&size.to_le_bytes())?;
        // Write payload
        file.write_all(&serialized)?;
        
        file.sync_data()?;
        Ok(())
    }

    pub fn read_all_events(&self) -> std::io::Result<Vec<AttendanceEvent>> {
        let path = Path::new(&self.file_path);
        if !path.exists() {
            return Ok(Vec::new());
        }

        let mut file = File::open(path)?;
        let mut events = Vec::new();

        loop {
            let mut size_buf = [0u8; 4];
            if file.read_exact(&mut size_buf).is_err() {
                break; // EOF
            }
            let size = u32::from_le_bytes(size_buf) as usize;

            let mut payload = vec![0u8; size];
            file.read_exact(&mut payload)?;

            if let Ok(event) = bincode::deserialize::<AttendanceEvent>(&payload) {
                events.push(event);
            }
        }

        Ok(events)
    }

    /// O(1) instant purge by truncating the file
    pub fn truncate_purge(&self) -> std::io::Result<()> {
        File::create(&self.file_path)?; // Opens with O_TRUNC
        Ok(())
    }
}
