export type WalletMode = 'embedded' | 'external';

import { STORAGE_KEYS } from './storageKeys';

const MODE_KEY = STORAGE_KEYS.walletMode;

export async function getWalletMode(): Promise<WalletMode> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const result = await chrome.storage.local.get(MODE_KEY);
    const mode = result[MODE_KEY] as WalletMode | undefined;
    return mode === 'external' ? 'external' : 'embedded';
  }
  const raw = localStorage.getItem(MODE_KEY);
  return raw === 'external' ? 'external' : 'embedded';
}

export async function setWalletMode(mode: WalletMode): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [MODE_KEY]: mode });
    return;
  }
  localStorage.setItem(MODE_KEY, mode);
}

export function walletModeLabel(mode: WalletMode): string {
  return mode === 'external' ? 'External wallet (browser)' : 'Built-in wallet';
}
