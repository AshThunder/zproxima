import { APP_NAME } from '@shared/brand';

export function getQueryParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

export function getExtensionId(): string | null {
  return getQueryParams().get('extId');
}

export function getSessionId(): string | null {
  return getQueryParams().get('session');
}

export function getRequestedAction(): string {
  return getQueryParams().get('action') ?? 'connect';
}

const DEEP_LINK_PARAM_KEYS = [
  'action',
  'symbol',
  'amount',
  'recipient',
  'confidentialAddress',
  'underlyingAddress',
  'tab',
  'command',
  '_ts',
] as const;

/** Remove one-shot action params so refresh does not re-trigger wallet signing. */
export function clearDeepLinkParams(): void {
  const params = new URLSearchParams(window.location.search);
  let changed = false;
  for (const key of DEEP_LINK_PARAM_KEYS) {
    if (params.has(key)) {
      params.delete(key);
      changed = true;
    }
  }
  if (!changed) return;
  const query = params.toString();
  const next = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history.replaceState(window.history.state, '', next);
}

export async function sendToExtension(message: Record<string, unknown>): Promise<unknown> {
  const extId = getExtensionId();
  if (!extId) {
    throw new Error(`Missing extension id in URL. Re-open from the ${APP_NAME} side panel.`);
  }
  const runtime = (globalThis as { chrome?: { runtime?: { sendMessage?: Function; lastError?: { message?: string } } } }).chrome?.runtime;
  if (!runtime?.sendMessage) {
    throw new Error(`Cannot reach ${APP_NAME} extension. Reload the extension and try again.`);
  }
  return new Promise((resolve, reject) => {
    runtime.sendMessage!(extId, message, (response: unknown) => {
      const err = runtime.lastError;
      if (err?.message) {
        reject(new Error(err.message));
        return;
      }
      resolve(response);
    });
  });
}

export async function notifyConnect(address: string, chainId: number, walletLabel: string): Promise<void> {
  const sessionId = getSessionId();
  if (!sessionId) throw new Error('Missing session id');
  const res = (await sendToExtension({
    type: 'BRIDGE_CONNECT',
    sessionId,
    address,
    chainId,
    walletLabel,
  })) as { ok?: boolean; error?: string };
  if (!res?.ok) throw new Error(res?.error ?? 'Extension rejected connection');
}

export async function notifyDisconnect(): Promise<void> {
  const sessionId = getSessionId();
  if (!sessionId) return;
  try {
    await sendToExtension({ type: 'BRIDGE_DISCONNECT', sessionId });
  } catch {
    // Local session is cleared even if the extension is unreachable.
  }
}

export async function sendHeartbeat(): Promise<void> {
  const sessionId = getSessionId();
  if (!sessionId) return;
  await sendToExtension({ type: 'BRIDGE_HEARTBEAT', sessionId });
}

export async function logBridgeActivity(activity: Record<string, unknown>): Promise<string | undefined> {
  const res = (await sendToExtension({
    type: 'BRIDGE_ACTIVITY',
    activity,
  })) as { ok?: boolean; activityId?: string; error?: string };
  if (!res?.ok) throw new Error(res?.error ?? 'Failed to log activity');
  return res.activityId;
}

export async function notifyDecryptedBalance(
  confidentialAddress: string,
  confidentialBalanceWei: string,
): Promise<void> {
  const sessionId = getSessionId();
  if (!getExtensionId() || !sessionId) return;
  const res = (await sendToExtension({
    type: 'BRIDGE_DECRYPT_BALANCE',
    sessionId,
    confidentialAddress,
    confidentialBalanceWei,
  })) as { ok?: boolean; error?: string };
  if (!res?.ok) throw new Error(res?.error ?? 'Failed to sync decrypted balance to extension');
}

export async function updateBridgeActivity(
  id: string,
  patch: {
    status?: string;
    txHash?: string;
    message?: string;
    confidentialAddress?: string;
    confidentialBalanceWei?: string;
  },
): Promise<void> {
  const res = (await sendToExtension({
    type: 'BRIDGE_ACTIVITY_UPDATE',
    id,
    ...patch,
  })) as { ok?: boolean; error?: string };
  if (!res?.ok) throw new Error(res?.error ?? 'Failed to update activity');
}
