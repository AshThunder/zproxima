import { STORAGE_KEYS } from './storageKeys';

export const DECRYPTED_BALANCES_KEY = STORAGE_KEYS.decryptedBalances;

export interface DecryptedBalanceEntry {
  balanceWei: string;
  updatedAt: number;
}

export type DecryptedBalanceCache = Record<string, DecryptedBalanceEntry>;

export interface DecryptedBalanceStore {
  ownerAddress: string;
  balances: DecryptedBalanceCache;
}

const EMPTY_STORE: DecryptedBalanceStore = { ownerAddress: '', balances: {} };

function normalizeOwner(address: string): string {
  return address.toLowerCase();
}

function normalizeStore(raw: unknown): DecryptedBalanceStore {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_STORE };
  const value = raw as Record<string, unknown>;
  if (typeof value.ownerAddress === 'string' && value.balances && typeof value.balances === 'object') {
    return {
      ownerAddress: normalizeOwner(value.ownerAddress),
      balances: value.balances as DecryptedBalanceCache,
    };
  }
  // Legacy flat cache (no owner) — discard to avoid showing another wallet's balances.
  return { ...EMPTY_STORE };
}

async function storageGet(): Promise<DecryptedBalanceStore> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const result = await chrome.storage.local.get(DECRYPTED_BALANCES_KEY);
    return normalizeStore(result[DECRYPTED_BALANCES_KEY]);
  }
  const raw = localStorage.getItem(DECRYPTED_BALANCES_KEY);
  return raw ? normalizeStore(JSON.parse(raw)) : { ...EMPTY_STORE };
}

async function storageSet(store: DecryptedBalanceStore): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [DECRYPTED_BALANCES_KEY]: store });
    return;
  }
  localStorage.setItem(DECRYPTED_BALANCES_KEY, JSON.stringify(store));
}

export async function getDecryptedBalanceStore(): Promise<DecryptedBalanceStore> {
  return storageGet();
}

export async function getDecryptedBalanceMap(ownerAddress: string): Promise<DecryptedBalanceCache> {
  const store = await storageGet();
  if (!ownerAddress || store.ownerAddress !== normalizeOwner(ownerAddress)) {
    return {};
  }
  return store.balances;
}

export async function setDecryptedBalance(
  ownerAddress: string,
  confidentialAddress: string,
  balanceWei: bigint,
): Promise<void> {
  const owner = normalizeOwner(ownerAddress);
  const store = await storageGet();
  if (store.ownerAddress !== owner) {
    store.ownerAddress = owner;
    store.balances = {};
  }
  store.balances[confidentialAddress.toLowerCase()] = {
    balanceWei: balanceWei.toString(),
    updatedAt: Date.now(),
  };
  await storageSet(store);

  if (typeof window !== 'undefined' && window.location) {
    const params = new URLSearchParams(window.location.search);
    const extId = params.get('extId');
    const sessionId = params.get('session');
    if (extId && sessionId) {
      const runtime = (globalThis as any).chrome?.runtime;
      if (runtime?.sendMessage) {
        runtime.sendMessage(
          extId,
          {
            type: 'BRIDGE_DECRYPT_BALANCE',
            sessionId,
            confidentialAddress,
            confidentialBalanceWei: balanceWei.toString(),
          },
          () => {
            const err = runtime.lastError;
            if (err) {
              console.warn('Failed to notify extension of decrypted balance:', err);
            }
          },
        );
      }
    }
  }
}

export async function clearDecryptedBalances(): Promise<void> {
  await storageSet({ ...EMPTY_STORE });
}

export async function clearDecryptedBalance(
  ownerAddress: string,
  confidentialAddress: string,
): Promise<void> {
  const store = await storageGet();
  if (store.ownerAddress !== normalizeOwner(ownerAddress)) return;
  const key = confidentialAddress.toLowerCase();
  if (!store.balances[key]) return;
  delete store.balances[key];
  await storageSet(store);
}

export function applyDecryptedCache<T extends { public: bigint; confidential: bigint; isLocked: boolean }>(
  balances: Record<string, T>,
  cache: DecryptedBalanceCache,
): Record<string, T> {
  const next = { ...balances };
  for (const [key, entry] of Object.entries(cache)) {
    const existing = next[key] ?? {
      public: 0n,
      confidential: 0n,
      isLocked: true,
    } as T;
    next[key] = {
      ...existing,
      confidential: BigInt(entry.balanceWei),
      isLocked: false,
    };
  }
  return next;
}
