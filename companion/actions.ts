import type { WebActionParams } from '@shared/webSigning';
import { runWebAction } from '@shared/webSigning';
import type { Eip1193Provider } from '@shared/zama';
import { bridgeActivitySink, localWebActivitySink } from './activitySink';
import { getExtensionId } from './bridge';
import { APP_NAME } from '@shared/brand';

export type ActionParams = WebActionParams;

export async function runCompanionAction(
  action: string,
  params: ActionParams,
  ethereum: Eip1193Provider,
  userAddress: string,
  walletLabel: string,
  onProgress: (msg: string) => void,
): Promise<void> {
  if (action === 'bot') {
    throw new Error(`ZBot is only available in the ${APP_NAME} extension side panel.`);
  }
  const sink = getExtensionId() ? bridgeActivitySink(walletLabel) : localWebActivitySink(walletLabel);
  await runWebAction(action, params, ethereum, userAddress, walletLabel, onProgress, sink);
}
