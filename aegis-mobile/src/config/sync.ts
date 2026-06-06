export const syncConfig = {
  endpoint: 'https://mock.nhai-hackathon.gov.in/api/v1/sync',
  authToken: 'mock_token_hackathon_demo_123',
  serverPublicKeyHex: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  deviceIdHeader: 'X-Device-Hardware-ID',
  deviceIdValue: 'DEMO-DEVICE-999',
  timeoutMs: 15000,
};

export function isSyncConfigured(): boolean {
  return Boolean(
    syncConfig.endpoint &&
      syncConfig.authToken &&
      syncConfig.serverPublicKeyHex,
  );
}
