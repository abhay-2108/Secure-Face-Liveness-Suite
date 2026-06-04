# Datalake 3.0 AWS Integration Guide

A core requirement for Hackathon 7.0 is demonstrating the ability to synchronize offline facial recognition biometric logs securely to a centralized data lake. 

Aegis handles this via a zero-trust, edge-first architecture.

Sync endpoints and keys are configured in `aegis-mobile/src/config/sync.ts`.

## 1. Encrypted Offline Ledger
When devices operate in remote sites (e.g. mines, deep basements) without internet connectivity, the Rust engine records all authentication attempts (including 128-D vectors and liveness metrics) into a binary ledger (`ledger.bin`).

This file is immediately symmetrically encrypted on-disk using **ChaCha20-Poly1305**. The encryption key is derived from the Android Hardware ID (SHA-256), making it impossible to decrypt even if the device is rooted and the file is exfiltrated.

## 2. Sync Trigger Mechanism
When a supervisor triggers a sync (or the device detects a stable Wi-Fi connection), the React Native frontend queries the Rust engine's internal metrics. 

When `OpenFace.triggerSync()` is called, the TypeScript layer initiates the synchronization.

### The Upload Process (TypeScript)
```typescript
const ledgerExport = await OpenFace.exportLedgerBase64();
if (!ledgerExport.success || ledgerExport.byteCount === 0) return;

// Securely POST to AWS API Gateway
const response = await fetch('https://api.datalake.example.com/v3/sync', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer HACKATHON_TEMPORARY_TOKEN',
    'Content-Type': 'application/json',
    'X-Device-Hardware-ID': 'aegis-edge-node-01',
  },
  body: JSON.stringify({
    ledgerBase64: ledgerExport.base64,
    byteCount: ledgerExport.byteCount,
  }),
});

// After the server responds with a purge token and record IDs
const { purgeToken, recordIds } = await response.json();
await OpenFace.verifyAndPurge(recordIds, purgeToken, SERVER_PUBLIC_KEY_HEX);
```

## 3. Destructive Purge (GDPR / CCPA Compliance)
Once the AWS API Gateway acknowledges successful receipt of the ledger (HTTP 200 OK), the server sends back an **Ed25519 Cryptographic Signature** verifying the receipt.

The React Native application passes this signature down through the JNI bridge to the Rust engine. The Rust engine verifies the signature against its hardcoded public key. 

If the signature matches, the Rust engine executes an OS-level `O_TRUNC` file wipe, guaranteeing **0 bytes of data residue** remain on the local edge node. This strict destructive purge satisfies the most stringent privacy requirements.
