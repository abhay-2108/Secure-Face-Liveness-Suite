export const syncConfig = {
  endpoint: '',
  authToken: '',
  serverPublicKeyHex: '',
  deviceIdHeader: 'X-Device-Hardware-ID',
  deviceIdValue: '',
  timeoutMs: 15000,
};

export function isSyncConfigured(): boolean {
  return Boolean(
    syncConfig.endpoint &&
      syncConfig.authToken &&
      syncConfig.serverPublicKeyHex,
  );
}
