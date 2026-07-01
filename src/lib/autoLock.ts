import { STORAGE_KEYS } from './storageKeys';

const AUTO_LOCK_KEY = STORAGE_KEYS.autoLockMinutes;
export const DEFAULT_AUTO_LOCK_MINUTES = 15;

export async function getAutoLockMinutes(): Promise<number> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const result = await chrome.storage.local.get(AUTO_LOCK_KEY);
    const val = result[AUTO_LOCK_KEY] as number | undefined;
    return typeof val === 'number' && val > 0 ? val : DEFAULT_AUTO_LOCK_MINUTES;
  }
  const raw = localStorage.getItem(AUTO_LOCK_KEY);
  const parsed = raw ? Number(raw) : DEFAULT_AUTO_LOCK_MINUTES;
  return parsed > 0 ? parsed : DEFAULT_AUTO_LOCK_MINUTES;
}

export async function setAutoLockMinutes(minutes: number): Promise<void> {
  const val = Math.max(1, Math.min(120, minutes));
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [AUTO_LOCK_KEY]: val });
    return;
  }
  localStorage.setItem(AUTO_LOCK_KEY, String(val));
}
