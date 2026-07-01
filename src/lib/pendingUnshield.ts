import { indexedDBStorage, loadPendingUnshield } from '@zama-fhe/sdk';
import type { TokenPair } from './zama';

export interface PendingUnshieldItem {
  pair: TokenPair;
  txHash: string;
}

export async function listPendingUnshields(pairs: TokenPair[]): Promise<PendingUnshieldItem[]> {
  const pending: PendingUnshieldItem[] = [];
  for (const pair of pairs) {
    try {
      const txHash = await loadPendingUnshield(indexedDBStorage, pair.confidentialAddress);
      if (txHash) pending.push({ pair, txHash });
    } catch {
      // ignore per-token errors
    }
  }
  return pending;
}
