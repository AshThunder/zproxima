/** Chrome extension + web companion storage keys (Zproxima). */
export const STORAGE_KEYS = {
  vault: 'zproxima_vault',
  salt: 'zproxima_salt',
  session: 'zproxima_session',
  accountIndex: 'zproxima_active_account_index',
  activity: 'zproxima_activity',
  decryptedBalances: 'zproxima_decrypted_balances',
  externalBridge: 'zproxima_external_bridge',
  walletMode: 'zproxima_wallet_mode',
  autoLockMinutes: 'zproxima_auto_lock_minutes',
  priceCache: 'zproxima_price_cache_v2',
  privacyMode: 'zproxima_privacy_mode',
  pendingWrap: 'zproxima_pending_wrap',
  migrationFlag: 'zproxima_storage_migrated_v1',
} as const;

/** DOM event for extension ↔ companion signing bridge. */
export const BRIDGE_ACTION_EVENT = 'zproxima-bridge-action';

const LEGACY_LOCAL_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['zregister_vault', STORAGE_KEYS.vault],
  ['zregister_salt', STORAGE_KEYS.salt],
  ['zregister_active_account_index', STORAGE_KEYS.accountIndex],
  ['zregister_activity', STORAGE_KEYS.activity],
  ['zregister_decrypted_balances', STORAGE_KEYS.decryptedBalances],
  ['zregister_external_bridge', STORAGE_KEYS.externalBridge],
  ['zregister_wallet_mode', STORAGE_KEYS.walletMode],
  ['zregister_auto_lock_minutes', STORAGE_KEYS.autoLockMinutes],
  ['zregister_price_cache_v2', STORAGE_KEYS.priceCache],
  ['zregister_privacy_mode', STORAGE_KEYS.privacyMode],
];

const LEGACY_SESSION_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['zregister_session', STORAGE_KEYS.session],
  ['zregister_pending_wrap', STORAGE_KEYS.pendingWrap],
];

function isMigrated(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.migrationFlag) === '1';
  } catch {
    return false;
  }
}

function markMigrated(): void {
  try {
    localStorage.setItem(STORAGE_KEYS.migrationFlag, '1');
  } catch {
    // ignore
  }
}

async function migrateChromeLocalPair(legacy: string, next: string): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  const result = await chrome.storage.local.get([legacy, next]);
  if (result[legacy] !== undefined && result[next] === undefined) {
    await chrome.storage.local.set({ [next]: result[legacy] });
  }
  if (result[legacy] !== undefined) {
    await chrome.storage.local.remove(legacy);
  }
}

async function migrateChromeSessionPair(legacy: string, next: string): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.session) return;
  try {
    const result = await chrome.storage.session.get([legacy, next]);
    if (result[legacy] !== undefined && result[next] === undefined) {
      await chrome.storage.session.set({ [next]: result[legacy] });
    }
    if (result[legacy] !== undefined) {
      await chrome.storage.session.remove(legacy);
    }
  } catch {
    // session area may be unavailable outside extension context
  }
}

function migrateWebStoragePair(
  storage: Storage,
  legacy: string,
  next: string,
): void {
  const raw = storage.getItem(legacy);
  if (raw !== null && storage.getItem(next) === null) {
    storage.setItem(next, raw);
  }
  if (raw !== null) {
    storage.removeItem(legacy);
  }
}

/**
 * One-time migration from ZRegister storage keys. Safe to call on every boot.
 */
export async function migrateLegacyStorage(): Promise<void> {
  if (isMigrated()) return;

  for (const [legacy, next] of LEGACY_LOCAL_PAIRS) {
    await migrateChromeLocalPair(legacy, next);
    if (typeof localStorage !== 'undefined') {
      migrateWebStoragePair(localStorage, legacy, next);
    }
  }

  for (const [legacy, next] of LEGACY_SESSION_PAIRS) {
    await migrateChromeSessionPair(legacy, next);
    if (typeof sessionStorage !== 'undefined') {
      migrateWebStoragePair(sessionStorage, legacy, next);
    }
  }

  markMigrated();
}
