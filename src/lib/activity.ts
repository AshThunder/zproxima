export type ActivityType = 'wrap' | 'unwrap' | 'send' | 'faucet' | 'approve' | 'decrypt' | 'other';
export type ActivityStatus = 'pending' | 'success' | 'failed';
export type ActivityWalletMode = 'embedded' | 'external';

export const ONCHAIN_ACTIVITY_TYPES = ['wrap', 'unwrap', 'send', 'faucet', 'approve'] as const;
export type OnchainActivityType = (typeof ONCHAIN_ACTIVITY_TYPES)[number];

export function isOnchainActivityType(type: ActivityType): type is OnchainActivityType {
  return (ONCHAIN_ACTIVITY_TYPES as readonly ActivityType[]).includes(type);
}

export interface ActivityItem {
  id: string;
  type: ActivityType;
  status: ActivityStatus;
  tokenSymbol: string;
  amount?: string;
  recipient?: string;
  txHash?: string;
  networkId: 'sepolia' | 'mainnet';
  timestamp: number;
  message?: string;
  walletMode?: ActivityWalletMode;
  walletLabel?: string;
}

import { STORAGE_KEYS } from './storageKeys';

const ACTIVITY_KEY = STORAGE_KEYS.activity;
const MAX_ITEMS = 100;

async function storageGet(): Promise<ActivityItem[]> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const result = await chrome.storage.local.get(ACTIVITY_KEY);
    return (result[ACTIVITY_KEY] as ActivityItem[] | undefined) ?? [];
  }
  const raw = localStorage.getItem(ACTIVITY_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function storageSet(items: ActivityItem[]): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [ACTIVITY_KEY]: items });
    return;
  }
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(items));
}

export async function logActivity(
  item: Omit<ActivityItem, 'id' | 'timestamp'>,
): Promise<ActivityItem | null> {
  if (!isOnchainActivityType(item.type)) {
    return null;
  }
  const entry: ActivityItem = {
    ...item,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };
  const items = await storageGet();
  await storageSet([entry, ...items].slice(0, MAX_ITEMS));
  return entry;
}

export async function updateActivity(
  id: string,
  patch: Partial<Pick<ActivityItem, 'status' | 'txHash' | 'message'>>,
): Promise<void> {
  const items = await storageGet();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return;
  items[idx] = { ...items[idx], ...patch };
  await storageSet(items);
}

export async function getActivities(limit = 50): Promise<ActivityItem[]> {
  const items = await storageGet();
  return items.filter((item) => isOnchainActivityType(item.type)).slice(0, limit);
}

export async function clearActivities(): Promise<void> {
  await storageSet([]);
}
