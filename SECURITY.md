<div align="center">
  <br />
  <h1>🔒 Security Policy & Zero-Trust Architecture</h1>
</div>

---

Because OpenFace processes raw biometric data (facial embeddings) on local edge hardware, security is our absolute highest priority. We assume that the physical device is inherently compromised and operate under a strict Zero-Trust philosophy.

## 🛡️ Supported Versions

We currently only provide security patches for the main branch release.

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

---

## 🔐 Cryptographic Guarantees

If you are auditing OpenFace, please be aware of the following architectural guarantees built into the Rust Engine:

### 1. Zero Disk Footprint (Biometrics)
Facial embeddings are never serialized to standard JSON files. They are stored inside a binary CRDT ledger. 

### 2. ChaCha20-Poly1305 Hardware Binding
The binary ledger is encrypted symmetrically using `ChaCha20-Poly1305`. The 256-bit encryption key is not hardcoded. It is mathematically derived from the unique CPU Serial Number and the Android Hardware ID. 
- **Attack Vector Defeated**: If a malicious actor roots the phone, steals the SQLite/binary ledger, and transfers it to a computer, the file will be completely unreadable because the decryption key cannot be derived off-device.

### 3. AES-GCM Model Protection
Our proprietary ONNX models (GhostFaceNet, Mini-FAS-Net) are AES-256-GCM encrypted on the physical NAND storage. The Rust engine decrypts these models dynamically into the 40MB Lock Arena inside RAM. 

### 4. Ed25519 Cryptographic Purge
When the device connects to the internet to sync offline logs, it requires a signed JWT from our backend using an `Ed25519` private key. Only when the Rust engine cryptographically verifies this signature will it execute an `O_TRUNC` file operation to securely wipe the local ledger.

---

## 🦠 Addressed Threat Models

We actively defend against the following physical and digital attack vectors:
- **Presentation Attacks (Spoofing):** Defeated via our JSI-bridged Fourier Analysis (Mini-FAS-Net) which rejects 2D screens and high-res printed photographs at the Edge before an embedding is even generated.
- **Root/Jailbreak Theft:** Defeated via Hardware-Bound ChaCha20 Keys. If an attacker roots the OS to dump the local `ledger.bin`, the encrypted embeddings cannot be extracted without the physical CPU serial.
- **Model Reverse Engineering:** Defeated via AES-256-GCM. The weights for GhostFaceNet and our Liveness models are shipped completely encrypted.
- **Memory Dumping/Scraping:** Defeated via our 40MB Rust Lock Arena. Sensitive tensor allocations exist inside a highly restricted, statically allocated block of RAM that bypasses standard OS memory managers and rewinds to zero instantly.

---

## 🚨 Reporting a Vulnerability

If you discover a vulnerability in the JSI bridge, the Rust Lock Arena, or the Cryptographic pipeline, **DO NOT OPEN A PUBLIC GITHUB ISSUE**.

Please report all security vulnerabilities to our core engineering team directly via email:
`security@openface.edge`

We will:
1. Acknowledge your report within 24 hours.
2. Provide a timeline for the security patch.
3. Issue a CVE and credit you in the release notes upon patch deployment.
