import type { ActivityItem } from '@shared/activity';
import { logActivity, updateActivity } from '@shared/activity';
import { logBridgeActivity, updateBridgeActivity, notifyDecryptedBalance } from './bridge';
import type { ActivitySink } from '@shared/webSigning';

export function bridgeActivitySink(walletLabel: string): ActivitySink {
  return {
    log: async (item) => {
      const id = await logBridgeActivity({
        ...item,
        walletLabel,
      });
      return id ? { id } : null;
    },
    update: async (id, patch) => {
      await updateBridgeActivity(id, patch);
    },
    notifyDecrypt: async (confidentialAddress, balanceWei) => {
      await notifyDecryptedBalance(confidentialAddress, balanceWei.toString());
    },
  };
}

export function localWebActivitySink(walletLabel: string): ActivitySink {
  return {
    log: async (item) => {
      const entry = await logActivity({
        ...item,
        walletMode: 'external',
        walletLabel,
      } as Omit<ActivityItem, 'id' | 'timestamp'>);
      return entry ? { id: entry.id } : null;
    },
    update: (id, patch) => updateActivity(id, patch),
  };
}
