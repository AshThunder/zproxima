/**
 * Secure Vault — Password-encrypted key storage
 * Uses PBKDF2 for key derivation and AES-GCM for encryption.
 */

import { STORAGE_KEYS } from './storageKeys';

const VAULT_KEY = STORAGE_KEYS.vault;
const SALT_KEY = STORAGE_KEYS.salt;
const PBKDF2_ITERATIONS = 600_000;

export interface VaultData {
  mnemonic: string;
  privateKey: string;
  activeAccountIndex?: number;
  importedAccounts?: { address: string; privateKey: string; name?: string }[];
}

// ─── Crypto Helpers ───

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptData(data: string, key: CryptoKey): Promise<{ iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(data)
  );
  return {
    iv: bufToHex(iv),
    ciphertext: bufToHex(new Uint8Array(encrypted)),
  };
}

async function decryptData(ciphertext: string, iv: string, key: CryptoKey): Promise<string> {
  const ivBuf = hexToBuf(iv);
  const ctBuf = hexToBuf(ciphertext);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuf },
    key,
    ctBuf
  );
  return new TextDecoder().decode(decrypted);
}

function bufToHex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuf(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// ─── Storage Helpers ───

function storageGet(key: string): Promise<unknown> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return new Promise(resolve => chrome.storage.local.get(key, (r: Record<string, unknown>) => resolve(r[key])));
  }
  const val = localStorage.getItem(key);
  return Promise.resolve(val ? JSON.parse(val) : undefined);
}

function storageSet(key: string, value: unknown): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return new Promise(resolve => chrome.storage.local.set({ [key]: value }, resolve));
  }
  localStorage.setItem(key, JSON.stringify(value));
  return Promise.resolve();
}

function storageRemove(key: string): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return new Promise(resolve => chrome.storage.local.remove(key, resolve));
  }
  localStorage.removeItem(key);
  return Promise.resolve();
}

// ─── Public API ───

export async function isVaultInitialized(): Promise<boolean> {
  const vault = await storageGet(VAULT_KEY);
  return !!vault;
}

export async function createVault(data: VaultData, password: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const key = await deriveKey(password, salt);
  const encrypted = await encryptData(JSON.stringify(data), key);

  await storageSet(SALT_KEY, bufToHex(salt));
  await storageSet(VAULT_KEY, encrypted);
}

export async function unlockVault(password: string): Promise<VaultData> {
  const saltHex = await storageGet(SALT_KEY) as string | undefined;
  const encrypted = await storageGet(VAULT_KEY) as { iv: string; ciphertext: string } | undefined;

  if (!saltHex || !encrypted) {
    throw new Error('Vault not initialized');
  }

  const key = await deriveKey(password, hexToBuf(saltHex));

  try {
    const raw = await decryptData(encrypted.ciphertext, encrypted.iv, key);
    return JSON.parse(raw) as VaultData;
  } catch {
    throw new Error('Incorrect password');
  }
}

export async function resetVault(): Promise<void> {
  await storageRemove(VAULT_KEY);
  await storageRemove(SALT_KEY);
  await clearSessionCache();
}

export async function updateVault(data: VaultData, password: string): Promise<void> {
  await createVault(data, password);
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const data = await unlockVault(currentPassword);
  if (newPassword.length < 8) throw new Error('New password must be at least 8 characters.');
  await createVault(data, newPassword);
}

// ─── Session Cache (auto-unlock) ───

const SESSION_KEY = STORAGE_KEYS.session;
const ACCOUNT_INDEX_KEY = STORAGE_KEYS.accountIndex;

export async function getActiveAccountIndex(): Promise<number> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const result = await chrome.storage.local.get(ACCOUNT_INDEX_KEY);
    const val = result[ACCOUNT_INDEX_KEY] as number | undefined;
    return typeof val === 'number' && val >= 0 ? val : 0;
  }
  const raw = localStorage.getItem(ACCOUNT_INDEX_KEY);
  const parsed = raw ? Number(raw) : 0;
  return parsed >= 0 ? parsed : 0;
}

export async function setActiveAccountIndex(index: number): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [ACCOUNT_INDEX_KEY]: index });
    return;
  }
  localStorage.setItem(ACCOUNT_INDEX_KEY, String(index));
}

export async function cacheSession(data: VaultData): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      await chrome.storage.session.set({ [SESSION_KEY]: data });
      return;
    }
  } catch (e) {
    console.warn('chrome.storage.session access failed, falling back:', e);
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

export async function getSessionCache(): Promise<VaultData | null> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      const res = await chrome.storage.session.get(SESSION_KEY);
      const cached = res[SESSION_KEY] as VaultData | undefined;
      if (cached && cached.mnemonic && cached.privateKey) {
        return cached;
      }
      return null;
    }
  } catch (e) {
    console.warn('chrome.storage.session access failed, falling back:', e);
  }
  const raw = sessionStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function clearSessionCache(): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      await chrome.storage.session.remove(SESSION_KEY);
      return;
    }
  } catch (e) {
    console.warn('chrome.storage.session access failed, falling back:', e);
  }
  sessionStorage.removeItem(SESSION_KEY);
}
