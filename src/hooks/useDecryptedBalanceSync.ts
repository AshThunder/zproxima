import { useEffect } from 'react';
import {
  DECRYPTED_BALANCES_KEY,
  applyDecryptedCache,
  getDecryptedBalanceMap,
  type DecryptedBalanceStore,
} from '../lib/decryptedBalances';

export interface BalanceSlot {
  public: bigint;
  confidential: bigint;
  isLocked: boolean;
}

/** Keep balance maps in sync when companion decrypt writes to extension storage. */
export function useDecryptedBalanceSync(
  userAddress: string,
  setBalances: React.Dispatch<React.SetStateAction<Record<string, BalanceSlot>>>,
) {
  useEffect(() => {
    const owner = userAddress.toLowerCase();

    const mergeCache = (store: DecryptedBalanceStore | undefined) => {
      if (!store || store.ownerAddress !== owner) return;
      setBalances((prev) => applyDecryptedCache(prev, store.balances));
    };

    void getDecryptedBalanceMap(userAddress).then((cache) => {
      if (Object.keys(cache).length > 0) {
        setBalances((prev) => applyDecryptedCache(prev, cache));
      }
    });

    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      const onChanged = (
        changes: Record<string, chrome.storage.StorageChange>,
        area: string,
      ) => {
        if (area !== 'local' || !changes[DECRYPTED_BALANCES_KEY]) return;
        mergeCache(changes[DECRYPTED_BALANCES_KEY].newValue as DecryptedBalanceStore | undefined);
      };
      chrome.storage.onChanged.addListener(onChanged);
      return () => chrome.storage.onChanged.removeListener(onChanged);
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== DECRYPTED_BALANCES_KEY) return;
      mergeCache(event.newValue ? JSON.parse(event.newValue) : undefined);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [userAddress, setBalances]);
}
