#ifndef CRYPTO_ENGINE_H
#define CRYPTO_ENGINE_H

#include <vector>
#include <string>
#include <cstdint>

namespace NHAIEdgeAI {

/**
 * Struct wrapping the outputs of AES-256-GCM authenticated encryption.
 */
struct EncryptedData {
    std::vector<uint8_t> ciphertext;
    std::vector<uint8_t> iv;
    std::vector<uint8_t> authTag;
};

/**
 * Highly optimized, secure C++ Cryptographic engine.
 * Tailored for edge operations, providing standard symmetric authenticated encryption (AES-256-GCM)
 * and asymmetric tamper-proof signatures (SHA256-ECDSA) to secure biometric offline event logs.
 */
class CryptoEngine {
public:
    /**
     * Encrypts binary data using AES-256-GCM authenticated symmetric encryption.
     * Generates a secure, unique 12-byte Initialization Vector (IV) for every record.
     * 
     * @param plaintext: Raw data vector to encrypt
     * @param key: 256-bit symmetric encryption key (32 bytes)
     * @return EncryptedData struct containing ciphertext, IV, and GCM authentication tag
     */
    static EncryptedData encryptAES_256_GCM(const std::vector<uint8_t>& plaintext, 
                                            const std::vector<uint8_t>& key);

    /**
     * Decrypts ciphertext data using AES-256-GCM authenticated symmetric decryption.
     * Strictly verifies the GCM authentication tag to prevent ciphertext tampering.
     * 
     * @param data: EncryptedData struct holding ciphertext, IV, and auth tag
     * @param key: 256-bit symmetric decryption key (32 bytes)
     * @return Raw decrypted bytes, or empty vector if auth tag verification fails
     */
    static std::vector<uint8_t> decryptAES_256_GCM(const EncryptedData& data, 
                                                   const std::vector<uint8_t>& key);

    /**
     * Computes a SHA-256 cryptographic hash of the input data.
     * 
     * @param data: Raw binary input vector
     * @return 256-bit hash vector (32 bytes)
     */
    static std::vector<uint8_t> sha256(const std::vector<uint8_t>& data);

    /**
     * Computes an asymmetric digital signature over a SHA-256 hash using an ECDSA private key.
     * Uses standard SECG P-256 elliptic curve coordinates.
     * 
     * @param hash: 256-bit SHA-256 hash of the payload
     * @param privateKey: ECDSA private key bytes
     * @return Cryptographic ASN.1 DER signature vector
     */
    static std::vector<uint8_t> signECDSA(const std::vector<uint8_t>& hash, 
                                          const std::vector<uint8_t>& privateKey);

    /**
     * Verifies an ECDSA digital signature against a SHA-256 hash using the signer's public key.
     * 
     * @param hash: 256-bit SHA-256 hash of the payload
     * @param signature: ASN.1 DER digital signature to verify
     * @param publicKey: Registered ECDSA public key bytes
     * @return true if the signature is authentic and verified, false otherwise
     */
    static bool verifyECDSA(const std::vector<uint8_t>& hash, 
                            const std::vector<uint8_t>& signature, 
                            const std::vector<uint8_t>& publicKey);
};

} // namespace NHAIEdgeAI

#endif // CRYPTO_ENGINE_H
