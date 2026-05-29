#ifndef OFFLINE_LEDGER_MANAGER_H
#define OFFLINE_LEDGER_MANAGER_H

#include <sqlite3.h>
#include <string>
#include <vector>
#include <cstdint>
#include "CryptoEngine.h"

namespace NHAIEdgeAI {

/**
 * Structure representing an raw biometric attendance event.
 */
struct AttendanceEvent {
    std::string userId;
    int64_t timestamp;
    double latitude;
    double longitude;
    std::vector<float> faceEmbedding; // 128-dimensional biometric float vector
};

/**
 * Structure representing a cryptographically encrypted and signed record in SQLite database.
 */
struct OfflineRecord {
    std::string id;
    std::vector<uint8_t> encryptedPayload;
    std::vector<uint8_t> iv;
    std::vector<uint8_t> authTag;
    std::vector<uint8_t> signature;
    int64_t timestamp;
};

/**
 * Secure on-device database manager for logging offline events.
 * Manages SQLite schemas, serializes user data, encrypts payloads using AES-256-GCM,
 * signs entries using ECDSA private keys, and runs destructive deletions upon
 * successful background cloud synchronization.
 */
class OfflineLedgerManager {
public:
    /**
     * Constructor
     * @param dbPath: Absolute file path to the local SQLite database file (e.g. "nhai_attendance.db")
     */
    OfflineLedgerManager(const std::string& dbPath);
    ~OfflineLedgerManager();

    /**
     * Opens the SQLite database connection.
     */
    bool openDatabase();

    /**
     * Closes the active SQLite database connection.
     */
    void closeDatabase();

    /**
     * Bootstraps the local database schema, creating tables and indices if not present.
     */
    bool initializeTable();

    /**
     * Serializes, encrypts, and cryptographically signs an offline attendance event,
     * and inserts the secure record into the SQLite ledger.
     * 
     * @param event: AttendanceEvent raw details (PII + Face Vector)
     * @param aesKey: 256-bit symmetric encryption key (32 bytes)
     * @param privateKey: Asymmetric ECDSA private key (stored in Secure Keystore)
     * @return true if record was securely saved to local storage, false otherwise
     */
    bool insertEvent(const AttendanceEvent& event, 
                     const std::vector<uint8_t>& aesKey, 
                     const std::vector<uint8_t>& privateKey);

    /**
     * Reads all offline records from the SQLite ledger to compile background synchronization packet blocks.
     */
    std::vector<OfflineRecord> fetchAllRecords();

    /**
     * Executes a destructive transaction delete over matching synced records.
     * Requires a verified cryptographic purge authorization token issued by the AWS server.
     * 
     * @param recordIds: List of unique event record UUIDs to purge
     * @param authorizedPurgeToken: Secure purge token returned by AWS Lambda
     * @param serverPublicKey: Asymmetric public key of the AWS server to verify the token signature
     * @return true if token is validated and records are transactionally deleted, false otherwise
     */
    bool purgeRecords(const std::vector<std::string>& recordIds, 
                      const std::string& authorizedPurgeToken, 
                      const std::vector<uint8_t>& serverPublicKey);

private:
    std::string m_dbPath;
    sqlite3* m_db;

    // Helper functions for binary block serialization/deserialization
    std::vector<uint8_t> serializeEvent(const AttendanceEvent& event);
    AttendanceEvent deserializeEvent(const std::vector<uint8_t>& data);
};

} // namespace NHAIEdgeAI

#endif // OFFLINE_LEDGER_MANAGER_H
