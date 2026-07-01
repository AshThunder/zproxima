import type { ActivityItem } from './activity';
import { logActivity, updateActivity, isOnchainActivityType } from './activity';
import { setDecryptedBalance } from './decryptedBalances';

export interface ExternalBridgeState {
  sessionId: string;
  address: string;
  chainId: number;
  walletLabel: string;
  networkId: 'sepolia' | 'mainnet';
  connectedAt: number;
  lastHeartbeat: number;
  /** Companion browser tab — reused for signing instead of opening new tabs. */
  companionTabId?: number;
}

export type CompanionAction =
  | 'connect'
  | 'wrap'
  | 'unwrap'
  | 'send'
  | 'decrypt'
  | 'faucet'
  | 'bot';

export interface CompanionActionParams {
  confidentialAddress?: string;
  underlyingAddress?: string;
  symbol?: string;
  amount?: string;
  recipient?: string;
  tab?: 'wrap' | 'unwrap';
  command?: string;
}

import { STORAGE_KEYS } from './storageKeys';

const BRIDGE_KEY = STORAGE_KEYS.externalBridge;

export function getCompanionBaseUrl(): string {
  return (
    import.meta.env.VITE_COMPANION_URL?.trim() ||
    'http://localhost:5174'
  ).replace(/\/$/, '');
}

/** Ping the companion static server (build + `npm run serve:companion`). */
export async function checkCompanionReachable(timeoutMs = 4000): Promise<boolean> {
  const url = getCompanionBaseUrl();
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    window.clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

export function getExtensionId(): string | undefined {
  if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
    return chrome.runtime.id;
  }
  return undefined;
}

export function createBridgeSessionId(): string {
  return crypto.randomUUID();
}

function networkIdFromChainId(chainId: number): 'sepolia' | 'mainnet' {
  return chainId === 1 ? 'mainnet' : 'sepolia';
}

export async function getExternalBridgeState(): Promise<ExternalBridgeState | null> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const result = await chrome.storage.local.get(BRIDGE_KEY);
    return (result[BRIDGE_KEY] as ExternalBridgeState | undefined) ?? null;
  }
  const raw = localStorage.getItem(BRIDGE_KEY);
  return raw ? (JSON.parse(raw) as ExternalBridgeState) : null;
}

async function setExternalBridgeState(state: ExternalBridgeState | null): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    if (state) {
      await chrome.storage.local.set({ [BRIDGE_KEY]: state });
    } else {
      await chrome.storage.local.remove(BRIDGE_KEY);
    }
    return;
  }
  if (state) {
    localStorage.setItem(BRIDGE_KEY, JSON.stringify(state));
  } else {
    localStorage.removeItem(BRIDGE_KEY);
  }
}

export async function disconnectExternalBridge(): Promise<void> {
  await setExternalBridgeState(null);
}

export function isBridgeAlive(state: ExternalBridgeState | null, maxAgeMs = 90_000): boolean {
  if (!state) return false;
  return Date.now() - state.lastHeartbeat < maxAgeMs;
}

export function subscribeExternalBridge(
  listener: (state: ExternalBridgeState | null) => void,
): () => void {
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    const handler = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== 'local' || !changes[BRIDGE_KEY]) return;
      listener((changes[BRIDGE_KEY].newValue as ExternalBridgeState | undefined) ?? null);
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }
  const handler = (e: StorageEvent) => {
    if (e.key === BRIDGE_KEY) {
      listener(e.newValue ? (JSON.parse(e.newValue) as ExternalBridgeState) : null);
    }
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

function buildCompanionUrl(
  sessionId: string,
  action: CompanionAction,
  params: CompanionActionParams = {},
): string {
  const extId = getExtensionId();
  const url = new URL(getCompanionBaseUrl());
  url.searchParams.set('session', sessionId);
  if (extId) url.searchParams.set('extId', extId);
  url.searchParams.set('action', action);
  if (action !== 'connect') {
    url.searchParams.set('_ts', String(Date.now()));
  }
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export async function openCompanion(
  action: CompanionAction = 'connect',
  params: CompanionActionParams = {},
): Promise<string> {
  const existing = await getExternalBridgeState();
  const sessionId = existing?.sessionId ?? createBridgeSessionId();
  const href = buildCompanionUrl(sessionId, action, params);

  if (typeof chrome !== 'undefined' && chrome.tabs) {
    const tab = await findCompanionTab(existing?.companionTabId);

    if (tab?.id && action !== 'connect') {
      const delivered = await deliverActionToCompanionTab(tab.id, action, params);
      if (delivered) {
        await chrome.tabs.update(tab.id, { active: true });
        await rememberCompanionTab(tab.id);
        return sessionId;
      }
    }

    if (tab?.id) {
      await chrome.tabs.update(tab.id, { url: href, active: true });
      await rememberCompanionTab(tab.id);
      return sessionId;
    }

    const created = await chrome.tabs.create({ url: href });
    if (created.id) await rememberCompanionTab(created.id);
  } else {
    window.open(href, '_blank', 'noopener,noreferrer');
  }
  return sessionId;
}

async function rememberCompanionTab(tabId: number): Promise<void> {
  const current = await getExternalBridgeState();
  if (!current || current.companionTabId === tabId) return;
  await setExternalBridgeState({ ...current, companionTabId: tabId });
}

async function findCompanionTab(storedTabId?: number): Promise<chrome.tabs.Tab | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs) return null;

  const base = getCompanionBaseUrl();
  if (storedTabId) {
    try {
      const tab = await chrome.tabs.get(storedTabId);
      if (tab.id != null && tab.url?.startsWith(base)) return tab;
    } catch {
      // Tab closed — fall through to query.
    }
  }

  const tabs = await chrome.tabs.query({ url: [`${base}/*`, `${base}/`] });
  return tabs.find((t) => t.id != null) ?? null;
}

async function deliverActionToCompanionTab(
  tabId: number,
  action: CompanionAction,
  params: CompanionActionParams,
): Promise<boolean> {
  try {
    const res = await chrome.tabs.sendMessage(tabId, {
      type: 'BRIDGE_RUN_ACTION',
      action,
      params,
    });
    return !!(res && (res as { ok?: boolean }).ok);
  } catch {
    return false;
  }
}

/** Handle messages from the companion web page (background worker). */
export async function handleExternalBridgeMessage(
  message: Record<string, unknown>,
  context?: { tabId?: number },
): Promise<{ ok: boolean; error?: string; activityId?: string }> {
  const type = message.type as string | undefined;
  const companionTabId = context?.tabId;

  if (type === 'BRIDGE_CONNECT') {
    const address = String(message.address ?? '');
    const chainId = Number(message.chainId ?? 0);
    const sessionId = String(message.sessionId ?? '');
    const walletLabel = String(message.walletLabel ?? 'External wallet');
    if (!address || !sessionId) {
      return { ok: false, error: 'Missing address or sessionId' };
    }
    const state: ExternalBridgeState = {
      sessionId,
      address,
      chainId,
      walletLabel,
      networkId: networkIdFromChainId(chainId),
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
      companionTabId,
    };
    await setExternalBridgeState(state);
    return { ok: true };
  }

  if (type === 'BRIDGE_DISCONNECT') {
    await setExternalBridgeState(null);
    return { ok: true };
  }

  if (type === 'BRIDGE_HEARTBEAT') {
    const current = await getExternalBridgeState();
    const sessionId = String(message.sessionId ?? '');
    if (!current || current.sessionId !== sessionId) {
      return { ok: false, error: 'Unknown session' };
    }
    await setExternalBridgeState({
      ...current,
      lastHeartbeat: Date.now(),
      companionTabId: companionTabId ?? current.companionTabId,
    });
    return { ok: true };
  }

  if (type === 'BRIDGE_ACTIVITY') {
    const activity = message.activity as Partial<ActivityItem> | undefined;
    if (!activity?.type || !activity.tokenSymbol) {
      return { ok: false, error: 'Invalid activity payload' };
    }
    if (!isOnchainActivityType(activity.type)) {
      return { ok: true };
    }
    const entry = await logActivity({
      type: activity.type,
      status: activity.status ?? 'success',
      tokenSymbol: activity.tokenSymbol,
      amount: activity.amount,
      recipient: activity.recipient,
      txHash: activity.txHash,
      networkId: activity.networkId ?? 'sepolia',
      message: activity.message,
      walletMode: 'external',
      walletLabel: activity.walletLabel ?? 'External wallet',
    });
    return { ok: true, activityId: entry?.id };
  }

  if (type === 'BRIDGE_ACTIVITY_UPDATE') {
    const id = String(message.id ?? '');
    if (!id) return { ok: false, error: 'Missing activity id' };
    await updateActivity(id, {
      status: message.status as ActivityItem['status'] | undefined,
      txHash: message.txHash as string | undefined,
      message: message.message as string | undefined,
    });
    const confidentialAddress = message.confidentialAddress as string | undefined;
    const confidentialBalanceWei = message.confidentialBalanceWei as string | undefined;
    if (confidentialAddress && confidentialBalanceWei) {
      const bridge = await getExternalBridgeState();
      if (bridge?.address) {
        await setDecryptedBalance(bridge.address, confidentialAddress, BigInt(confidentialBalanceWei));
      }
    }
    return { ok: true };
  }

  if (type === 'BRIDGE_DECRYPT_BALANCE') {
    const current = await getExternalBridgeState();
    const sessionId = String(message.sessionId ?? '');
    if (!current || current.sessionId !== sessionId) {
      return { ok: false, error: 'Unknown session' };
    }
    const confidentialAddress = message.confidentialAddress as string | undefined;
    const confidentialBalanceWei = message.confidentialBalanceWei as string | undefined;
    if (!confidentialAddress || !confidentialBalanceWei) {
      return { ok: false, error: 'Missing decrypt balance payload' };
    }
    await setDecryptedBalance(current.address, confidentialAddress, BigInt(confidentialBalanceWei));
    return { ok: true };
  }

  return { ok: false, error: 'Unknown message type' };
}

export function externalWalletSourceLabel(state: ExternalBridgeState | null): string {
  return state?.walletLabel ?? 'External wallet';
}
