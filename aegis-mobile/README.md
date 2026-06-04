# Aegis Mobile App

This is the primary mobile demo application for Aegis. It provides live camera authentication, enrollment, and telemetry on Android devices.

## Requirements

- Node.js 18+
- Yarn
- Android SDK + NDK
- Physical Android device (VisionCamera frame processors do not run on emulators)

## Quick Start

```bash
cd aegis-mobile
yarn install
yarn android
```

## Sync Configuration

The sync client is configurable in [src/config/sync.ts](src/config/sync.ts). Provide:

- `endpoint`: Datalake sync endpoint
- `authToken`: Bearer token for the sync API
- `serverPublicKeyHex`: Ed25519 public key (hex) used to verify purge tokens
- `deviceIdValue`: Identifier to tag the device in requests (optional)

The sync response is expected to include:

```json
{
  "purgeToken": "<hex>",
  "recordIds": ["<id-1>", "<id-2>"]
}
```

If the config is incomplete, sync is disabled and the UI will show an error status.

## Notes

- The Rust engine uses the Android ID (SHA-256) for hardware-bound ledger encryption.
- Model assets are bundled in the `react-native-open-face` library and loaded at runtime.
