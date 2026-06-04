import { OpenFace } from 'react-native-open-face';
import { isSyncConfigured, syncConfig } from '../config/sync';

type SyncResult = {
  success: boolean;
  error?: string;
};

export async function performLedgerSync(): Promise<SyncResult> {
  if (!OpenFace.isInitialized) {
    return { success: false, error: 'Engine not initialized' };
  }

  if (!isSyncConfigured()) {
    await OpenFace.setSyncStatus('offline');
    return { success: false, error: 'Sync not configured' };
  }

  try {
    await OpenFace.triggerSync();

    const status = await OpenFace.getSyncStatus();
    if (status.pendingCount === 0) {
      await OpenFace.setSyncStatus('synced');
      return { success: true };
    }

    const exportResult = await OpenFace.exportLedgerBase64();
    if (!exportResult.success || exportResult.byteCount === 0) {
      await OpenFace.setSyncStatus('error');
      return { success: false, error: exportResult.error || 'Ledger export failed' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), syncConfig.timeoutMs);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${syncConfig.authToken}`,
    };

    if (syncConfig.deviceIdValue) {
      headers[syncConfig.deviceIdHeader] = syncConfig.deviceIdValue;
    }

    const response = await fetch(syncConfig.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ledgerBase64: exportResult.base64,
        byteCount: exportResult.byteCount,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      await OpenFace.setSyncStatus('error');
      return { success: false, error: `Sync failed: HTTP ${response.status}` };
    }

    const data = await response.json().catch(() => ({}));
    const purgeToken = data.purgeToken || data.purge_token;
    const recordIds = data.recordIds || data.record_ids;
    const serverPublicKeyHex =
      data.serverPublicKeyHex || syncConfig.serverPublicKeyHex;

    if (!purgeToken || !Array.isArray(recordIds)) {
      await OpenFace.setSyncStatus('error');
      return { success: false, error: 'Invalid sync response' };
    }

    const purgeResult = await OpenFace.verifyAndPurge(
      recordIds,
      purgeToken,
      serverPublicKeyHex,
    );

    if (purgeResult.success) {
      await OpenFace.setSyncStatus('synced');
      return { success: true };
    }

    await OpenFace.setSyncStatus('error');
    return { success: false, error: purgeResult.error || 'Purge verification failed' };
  } catch (error: any) {
    await OpenFace.setSyncStatus('error');
    return { success: false, error: error?.message || 'Sync failed' };
  }
}
