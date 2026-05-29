#include "OfflineLedgerManager.h"
#include <sstream>
#include <cstring>
#include <stdexcept>
#include <iostream>

namespace NHAIEdgeAI {

OfflineLedgerManager::OfflineLedgerManager(const std::string& dbPath)
    : m_dbPath(dbPath), m_db(nullptr) {}

OfflineLedgerManager::~OfflineLedgerManager() {
    closeDatabase();
}

bool OfflineLedgerManager::openDatabase() {
    if (m_db != nullptr) return true;
    int rc = sqlite3_open(m_dbPath.c_str(), &m_db);
    return (rc == SQLITE_OK);
}

void OfflineLedgerManager::closeDatabase() {
    if (m_db != nullptr) {
        sqlite3_close(m_db);
        m_db = nullptr;
    }
}

bool OfflineLedgerManager::initializeTable() {
    if (m_db == nullptr && !openDatabase()) return false;

    // Schema defines local ledger table
    const char* schemaSql = 
        "CREATE TABLE IF NOT EXISTS attendance_ledger ("
        "  id TEXT PRIMARY KEY,"
        "  encrypted_payload BLOB NOT NULL,"
        "  iv BLOB NOT NULL,"
        "  auth_tag BLOB NOT NULL,"
        "  signature BLOB NOT NULL,"
        "  timestamp INTEGER NOT NULL"
        ");"
        "CREATE INDEX IF NOT EXISTS idx_timestamp ON attendance_ledger(timestamp);";

    char* errorMsg = nullptr;
    int rc = sqlite3_exec(m_db, schemaSql, nullptr, nullptr, &errorMsg);
    if (rc != SQLITE_OK) {
        if (errorMsg != nullptr) {
            sqlite3_free(errorMsg);
        }
        return false;
    }
    return true;
}

// ----------------------------------------------------------------------------
// Compact Binary Serialization Utilities
// ----------------------------------------------------------------------------
std::vector<uint8_t> OfflineLedgerManager::serializeEvent(const AttendanceEvent& event) {
    std::vector<uint8_t> buffer;

    // 1. Serialize userId string length and characters
    uint32_t userLen = static_cast<uint32_t>(event.userId.size());
    const uint8_t* userLenPtr = reinterpret_cast<const uint8_t*>(&userLen);
    buffer.insert(buffer.end(), userLenPtr, userLenPtr + 4);
    buffer.insert(buffer.end(), event.userId.begin(), event.userId.end());

    // 2. Serialize timestamp (8 bytes)
    const uint8_t* timePtr = reinterpret_cast<const uint8_t*>(&event.timestamp);
    buffer.insert(buffer.end(), timePtr, timePtr + 8);

    // 3. Serialize location coordinates (8 bytes latitude, 8 bytes longitude)
    const uint8_t* latPtr = reinterpret_cast<const uint8_t*>(&event.latitude);
    buffer.insert(buffer.end(), latPtr, latPtr + 8);

    const uint8_t* lonPtr = reinterpret_cast<const uint8_t*>(&event.longitude);
    buffer.insert(buffer.end(), lonPtr, lonPtr + 8);

    // 4. Serialize 128-dimensional float face embedding vector (4 bytes size, 512 bytes floats)
    uint32_t embedLen = static_cast<uint32_t>(event.faceEmbedding.size());
    const uint8_t* embedLenPtr = reinterpret_cast<const uint8_t*>(&embedLen);
    buffer.insert(buffer.end(), embedLenPtr, embedLenPtr + 4);

    if (embedLen > 0) {
        const uint8_t* embedPtr = reinterpret_cast<const uint8_t*>(event.faceEmbedding.data());
        buffer.insert(buffer.end(), embedPtr, embedPtr + embedLen * sizeof(float));
    }

    return buffer;
}

AttendanceEvent OfflineLedgerManager::deserializeEvent(const std::vector<uint8_t>& data) {
    AttendanceEvent event;
    size_t offset = 0;

    // 1. Deserialize userId
    if (offset + 4 > data.size()) throw std::runtime_error("Deser error: userId len");
    uint32_t userLen = *reinterpret_cast<const uint32_t*>(&data[offset]);
    offset += 4;

    if (offset + userLen > data.size()) throw std::runtime_error("Deser error: userId characters");
    event.userId.assign(reinterpret_cast<const char*>(&data[offset]), userLen);
    offset += userLen;

    // 2. Deserialize timestamp
    if (offset + 8 > data.size()) throw std::runtime_error("Deser error: timestamp");
    event.timestamp = *reinterpret_cast<const int64_t*>(&data[offset]);
    offset += 8;

    // 3. Deserialize coordinates
    if (offset + 8 > data.size()) throw std::runtime_error("Deser error: latitude");
    event.latitude = *reinterpret_cast<const double*>(&data[offset]);
    offset += 8;

    if (offset + 8 > data.size()) throw std::runtime_error("Deser error: longitude");
    event.longitude = *reinterpret_cast<const double*>(&data[offset]);
    offset += 8;

    // 4. Deserialize embedding
    if (offset + 4 > data.size()) throw std::runtime_error("Deser error: embedding size");
    uint32_t embedLen = *reinterpret_cast<const uint32_t*>(&data[offset]);
    offset += 4;

    if (embedLen > 0) {
        if (offset + embedLen * sizeof(float) > data.size()) throw std::runtime_error("Deser error: embedding floats");
        event.faceEmbedding.resize(embedLen);
        std::memcpy(event.faceEmbedding.data(), &data[offset], embedLen * sizeof(float));
    }

    return event;
}

// ----------------------------------------------------------------------------
// Ledger CRUD Operations
// ----------------------------------------------------------------------------
bool OfflineLedgerManager::insertEvent(const AttendanceEvent& event, 
                                       const std::vector<uint8_t>& aesKey, 
                                       const std::vector<uint8_t>& privateKey) {
    if (m_db == nullptr && !openDatabase()) return false;

    // A. Serialize PII and embeddings
    std::vector<uint8_t> plaintext = serializeEvent(event);

    // B. Encrypt using AES-256-GCM
    EncryptedData cipher = CryptoEngine::encryptAES_256_GCM(plaintext, aesKey);

    // C. Sign the encrypted ciphertext to prevent offline DB tampering (ECDSA)
    std::vector<uint8_t> hash = CryptoEngine::sha256(cipher.ciphertext);
    std::vector<uint8_t> signature = CryptoEngine::signECDSA(hash, privateKey);

    // D. Generate unique string ID for the transaction
    std::stringstream ss;
    ss << event.userId << "_" << event.timestamp;
    std::string recordId = ss.str();

    // E. Save to local SQLite database in a prepared transaction statement
    const char* insertSql = 
        "INSERT OR REPLACE INTO attendance_ledger (id, encrypted_payload, iv, auth_tag, signature, timestamp) "
        "VALUES (?, ?, ?, ?, ?, ?);";

    sqlite3_stmt* stmt = nullptr;
    int rc = sqlite3_prepare_v2(m_db, insertSql, -1, &stmt, nullptr);
    if (rc != SQLITE_OK) return false;

    sqlite3_bind_text(stmt, 1, recordId.c_str(), -1, SQLITE_TRANSIENT);
    
    sqlite3_bind_blob(stmt, 2, cipher.ciphertext.data(), static_cast<int>(cipher.ciphertext.size()), SQLITE_TRANSIENT);
    sqlite3_bind_blob(stmt, 3, cipher.iv.data(), static_cast<int>(cipher.iv.size()), SQLITE_TRANSIENT);
    sqlite3_bind_blob(stmt, 4, cipher.authTag.data(), static_cast<int>(cipher.authTag.size()), SQLITE_TRANSIENT);
    sqlite3_bind_blob(stmt, 5, signature.data(), static_cast<int>(signature.size()), SQLITE_TRANSIENT);
    
    sqlite3_bind_int64(stmt, 6, event.timestamp);

    rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);

    return (rc == SQLITE_DONE);
}

std::vector<OfflineRecord> OfflineLedgerManager::fetchAllRecords() {
    std::vector<OfflineRecord> records;
    if (m_db == nullptr && !openDatabase()) return records;

    const char* selectSql = "SELECT id, encrypted_payload, iv, auth_tag, signature, timestamp FROM attendance_ledger;";
    sqlite3_stmt* stmt = nullptr;
    
    int rc = sqlite3_prepare_v2(m_db, selectSql, -1, &stmt, nullptr);
    if (rc != SQLITE_OK) return records;

    while (sqlite3_step(stmt) == SQLITE_ROW) {
        OfflineRecord rec;
        rec.id = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));

        // Unpack blobs
        const uint8_t* payloadPtr = reinterpret_cast<const uint8_t*>(sqlite3_column_blob(stmt, 1));
        int payloadLen = sqlite3_column_bytes(stmt, 1);
        rec.encryptedPayload.assign(payloadPtr, payloadPtr + payloadLen);

        const uint8_t* ivPtr = reinterpret_cast<const uint8_t*>(sqlite3_column_blob(stmt, 2));
        int ivLen = sqlite3_column_bytes(stmt, 2);
        rec.iv.assign(ivPtr, ivPtr + ivLen);

        const uint8_t* tagPtr = reinterpret_cast<const uint8_t*>(sqlite3_column_blob(stmt, 3));
        int tagLen = sqlite3_column_bytes(stmt, 3);
        rec.authTag.assign(tagPtr, tagPtr + tagLen);

        const uint8_t* sigPtr = reinterpret_cast<const uint8_t*>(sqlite3_column_blob(stmt, 4));
        int sigLen = sqlite3_column_bytes(stmt, 4);
        rec.signature.assign(sigPtr, sigPtr + sigLen);

        rec.timestamp = sqlite3_column_int64(stmt, 5);

        records.push_back(rec);
    }

    sqlite3_finalize(stmt);
    return records;
}

bool OfflineLedgerManager::purgeRecords(const std::vector<std::string>& recordIds, 
                                        const std::string& authorizedPurgeToken, 
                                        const std::vector<uint8_t>& serverPublicKey) {
    if (recordIds.empty()) return true;
    if (authorizedPurgeToken.length() % 2 != 0) {
        std::cout << "[DATABASE ERROR] Invalid hex token length (odd parity). Purge rejected!" << std::endl;
        return false;
    }
    if (m_db == nullptr && !openDatabase()) return false;

    // 1. Verify Cryptographic Session Purge Token
    // Concatenate record IDs to verify server token signatures
    std::string concatIds = "";
    for (const auto& id : recordIds) {
        concatIds += id;
    }
    
    std::vector<uint8_t> concatBytes(concatIds.begin(), concatIds.end());
    std::vector<uint8_t> hash = CryptoEngine::sha256(concatBytes);

    // Convert hex authorizedPurgeToken back to signature DER bytes
    std::vector<uint8_t> signatureBytes;
    for (size_t i = 0; i < authorizedPurgeToken.length(); i += 2) {
        std::string byteString = authorizedPurgeToken.substr(i, 2);
        uint8_t byte = static_cast<uint8_t>(strtol(byteString.c_str(), nullptr, 16));
        signatureBytes.push_back(byte);
    }

    // Verify asymmetric signature of central server
    if (!CryptoEngine::verifyECDSA(hash, signatureBytes, serverPublicKey)) {
        std::cout << "[DATABASE ERROR] Cryptographic purge token verification FAILED. Purge rejected!" << std::endl;
        return false; // Reject destructive delete!
    }

    // 2. Perform Destructive transactional Hard Delete to preserve local storage limits
    sqlite3_exec(m_db, "BEGIN TRANSACTION;", nullptr, nullptr, nullptr);

    const char* deleteSql = "DELETE FROM attendance_ledger WHERE id = ?;";
    sqlite3_stmt* stmt = nullptr;
    int rc = sqlite3_prepare_v2(m_db, deleteSql, -1, &stmt, nullptr);
    if (rc != SQLITE_OK) {
        sqlite3_exec(m_db, "ROLLBACK;", nullptr, nullptr, nullptr);
        return false;
    }

    bool allDeleted = true;
    for (const auto& id : recordIds) {
        sqlite3_reset(stmt);
        sqlite3_bind_text(stmt, 1, id.c_str(), -1, SQLITE_TRANSIENT);
        rc = sqlite3_step(stmt);
        if (rc != SQLITE_DONE) {
            allDeleted = false;
            break;
        }
    }

    sqlite3_finalize(stmt);

    if (allDeleted) {
        sqlite3_exec(m_db, "COMMIT;", nullptr, nullptr, nullptr);
        return true;
    } else {
        sqlite3_exec(m_db, "ROLLBACK;", nullptr, nullptr, nullptr);
        return false;
    }
}

} // namespace NHAIEdgeAI
