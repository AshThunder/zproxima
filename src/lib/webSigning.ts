import { ethers } from 'ethers';
import { savePendingUnshield, clearPendingUnshield, indexedDBStorage } from '@zama-fhe/sdk';
import {
  fetchRegistryPairs,
  getExternalZamaSDK,
  decryptConfidentialBalanceExternal,
  claimFaucetWithEthereum,
  formatRelayerError,
  ensureWrapAllowance,
  SEPOLIA_OFFICIAL_PAIRS,
  resolveConfidentialToken,
  type TokenPair,
  type Eip1193Provider,
} from './zama';
import { formatUnitsDisplay, shortenAddress } from './wallet';
import { processCommandWithSigning } from './bot';
import { logActivity, updateActivity, type ActivityItem, type ActivityType, isOnchainActivityType } from './activity';
import { setDecryptedBalance } from './decryptedBalances';
import { ensureSepoliaNetwork } from './chain';
import { DEFAULT_BROWSER_WALLET_LABEL } from './walletSession';

export interface WebActionParams {
  symbol?: string;
  amount?: string;
  recipient?: string;
  confidentialAddress?: string;
  underlyingAddress?: string;
  tab?: 'wrap' | 'unwrap';
  command?: string;
}

export interface ActivityUpdatePatch extends Partial<Pick<ActivityItem, 'status' | 'txHash' | 'message'>> {
  confidentialAddress?: string;
  confidentialBalanceWei?: string;
}

export interface ActivitySink {
  log: (item: Omit<ActivityItem, 'id' | 'timestamp'>) => Promise<{ id: string } | null>;
  update: (id: string, patch: ActivityUpdatePatch) => Promise<void>;
  /** Sync decrypted balance to the extension when signing in the companion tab. */
  notifyDecrypt?: (confidentialAddress: string, balanceWei: bigint) => Promise<void>;
}

export function localActivitySink(walletLabel = DEFAULT_BROWSER_WALLET_LABEL): ActivitySink {
  return {
    log: async (item) => {
      const entry = await logActivity({ ...item, walletMode: 'external', walletLabel });
      return entry ? { id: entry.id } : null;
    },
    update: (id, patch) => updateActivity(id, patch),
  };
}

function findPair(pairs: TokenPair[], symbol?: string, confidentialAddress?: string): TokenPair | undefined {
  if (confidentialAddress) {
    const hit = pairs.find(
      (p) => p.confidentialAddress.toLowerCase() === confidentialAddress.toLowerCase(),
    );
    if (hit) return hit;
  }
  if (!symbol) return undefined;
  return pairs.find(
    (p) =>
      p.symbol.toLowerCase() === symbol.toLowerCase() ||
      p.symbol.toLowerCase().replace('mock', '') === symbol.toLowerCase() ||
      p.symbol.toLowerCase().replace('cmock', 'c') === symbol.toLowerCase() ||
      p.symbol.toLowerCase().replace(/^c/, '') === symbol.toLowerCase(),
  );
}

function activityTypeForAction(action: string, tab?: string): ActivityType {
  if (action === 'wrap') return 'wrap';
  if (action === 'unwrap' || tab === 'unwrap') return 'unwrap';
  if (action === 'send') return 'send';
  if (action === 'faucet') return 'faucet';
  if (action === 'decrypt') return 'decrypt';
  return 'other';
}

export async function runWebAction(
  action: string,
  params: WebActionParams,
  ethereum: Eip1193Provider,
  userAddress: string,
  walletLabel: string,
  onProgress: (msg: string) => void,
  sink: ActivitySink = localActivitySink(walletLabel),
): Promise<{ txHash?: string } | void> {
  if (action === 'connect') return;

  onProgress('Checking network — switch to Sepolia in your wallet if prompted…');
  await ensureSepoliaNetwork(ethereum);

  const networkId = (await new ethers.BrowserProvider(ethereum).getNetwork()).chainId === 1n
    ? 'mainnet'
    : 'sepolia';

  if (action === 'bot') {
    const command = params.command?.trim();
    if (!command) throw new Error('Missing bot command.');
    onProgress('Running ZBot command…');
    const result = await processCommandWithSigning(
      command,
      { mode: 'external', ethereum },
      userAddress,
      onProgress,
    );
    onProgress(result.message);
    return;
  }

  const pairs = await fetchRegistryPairs(undefined, ethereum);
  const pair =
    findPair(pairs, params.symbol, params.confidentialAddress) ??
    (params.underlyingAddress
      ? SEPOLIA_OFFICIAL_PAIRS.find(
          (p) => p.underlyingAddress.toLowerCase() === params.underlyingAddress!.toLowerCase(),
        )
      : undefined);

  const resolvedAction =
    action === 'wrap' || action === 'unwrap'
      ? action
      : params.tab === 'unwrap'
        ? 'unwrap'
        : params.tab === 'wrap'
          ? 'wrap'
          : action;

  if (!pair && resolvedAction !== 'decrypt') {
    throw new Error('Token not found in registry.');
  }

  const activityType = activityTypeForAction(resolvedAction, params.tab);
  const activity =
    resolvedAction === 'decrypt' || !isOnchainActivityType(activityType)
      ? null
      : await sink.log({
          type: activityType,
          status: 'pending',
          tokenSymbol: pair?.symbol ?? params.symbol ?? 'TOKEN',
          amount: params.amount,
          recipient: params.recipient,
          networkId,
        });

  try {
    if (resolvedAction === 'decrypt') {
      const resolvedPair =
        pair ??
        (params.confidentialAddress
          ? await resolveConfidentialToken(params.confidentialAddress, pairs)
          : null);
      if (!resolvedPair) throw new Error('Token not found in registry.');
      onProgress('Authorizing decrypt in your wallet…');
      const result = await decryptConfidentialBalanceExternal(ethereum, resolvedPair, userAddress);
      const balance = formatUnitsDisplay(result.confidentialBalance, resolvedPair.decimals);
      await setDecryptedBalance(userAddress, resolvedPair.confidentialAddress, result.confidentialBalance);
      try {
        await sink.notifyDecrypt?.(resolvedPair.confidentialAddress, result.confidentialBalance);
      } catch (err) {
        console.warn('Failed to sync decrypted balance to extension', err);
      }
      onProgress(`Private balance: ${balance} ${resolvedPair.symbol}`);
      return;
    }

    if (resolvedAction === 'faucet') {
      if (!pair) throw new Error('Token not found.');
      onProgress('Claiming faucet tokens…');
      const txHash = await claimFaucetWithEthereum(ethereum, pair.underlyingAddress, userAddress);
      if (activity) await sink.update(activity.id, { status: 'success', txHash });
      onProgress(`Faucet claim confirmed: ${shortenAddress(txHash)}`);
      return { txHash };
    }

    if (!pair || !params.amount) {
      throw new Error('Missing token or amount.');
    }

    const amtWei = ethers.parseUnits(params.amount, pair.decimals);
    const provider = new ethers.BrowserProvider(ethereum);
    const signer = await provider.getSigner();

    if (pair.isCustom) {
      const wrapperContract = new ethers.Contract(
        pair.confidentialAddress,
        [
          'function wrap(address to, uint256 amount) public returns (uint256)',
          'function unwrap(address to, uint256 amount) public returns (uint256)',
          'function transfer(address to, uint256 value) public returns (bool)'
        ],
        signer
      );

      if (resolvedAction === 'wrap') {
        await ensureWrapAllowance(signer, pair, amtWei, onProgress);
        onProgress('Step 2 — confirm wrap in your wallet…');
        const tx = await wrapperContract.wrap(userAddress, amtWei);
        onProgress(`Wrap submitted: ${shortenAddress(tx.hash)}. Confirming...`);
        await tx.wait();
        if (activity) await sink.update(activity.id, { status: 'success', txHash: tx.hash });
        onProgress(`Wrapped successfully: ${shortenAddress(tx.hash)}`);
        return { txHash: tx.hash };
      }

      if (resolvedAction === 'unwrap') {
        onProgress('Confirm unwrap in your wallet…');
        const tx = await wrapperContract.unwrap(userAddress, amtWei);
        onProgress(`Unwrap submitted: ${shortenAddress(tx.hash)}. Confirming...`);
        await tx.wait();
        if (activity) await sink.update(activity.id, { status: 'success', txHash: tx.hash });
        onProgress(`Unwrapped successfully: ${shortenAddress(tx.hash)}`);
        return { txHash: tx.hash };
      }

      if (resolvedAction === 'send') {
        if (!params.recipient) throw new Error('Missing recipient address.');
        onProgress('Confirm transfer in your wallet…');
        const tx = await wrapperContract.transfer(params.recipient, amtWei);
        onProgress(`Transfer submitted: ${shortenAddress(tx.hash)}. Confirming...`);
        await tx.wait();
        if (activity) await sink.update(activity.id, { status: 'success', txHash: tx.hash });
        onProgress(`Sent successfully: ${shortenAddress(tx.hash)}`);
        return { txHash: tx.hash };
      }
    } else {
      const sdk = await getExternalZamaSDK(ethereum);
      const token = sdk.createWrappedToken(pair.confidentialAddress);

      if (resolvedAction === 'wrap') {
        await ensureWrapAllowance(signer, pair, amtWei, onProgress);
        onProgress('Step 2 — confirm wrap in your wallet…');
        const { txHash } = await token.shield(amtWei, {
          approvalStrategy: 'skip',
          onShieldSubmitted: (hash) => onProgress(`Shield: ${shortenAddress(hash)}`),
        });
        if (activity) await sink.update(activity.id, { status: 'success', txHash });
        onProgress(`Wrapped successfully: ${shortenAddress(txHash)}`);
        return { txHash };
      }

      if (resolvedAction === 'unwrap') {
        onProgress('Unwrap phase 1 — confirm in your wallet…');
        const { txHash } = await token.unshield(amtWei, {
          onUnwrapSubmitted: async (hash) => {
            onProgress(`Unwrap submitted: ${shortenAddress(hash)}`);
            await savePendingUnshield(indexedDBStorage, pair.confidentialAddress, hash);
          },
          onFinalizing: () => onProgress('Threshold proof received — finalizing…'),
          onFinalizeSubmitted: async (hash) => {
            onProgress(`Finalized: ${shortenAddress(hash)}`);
            await clearPendingUnshield(indexedDBStorage, pair.confidentialAddress);
          },
        });
        if (activity) await sink.update(activity.id, { status: 'success', txHash });
        onProgress(`Unwrapped successfully: ${shortenAddress(txHash)}`);
        return { txHash };
      }

      if (resolvedAction === 'send') {
        if (!params.recipient) throw new Error('Missing recipient address.');
        onProgress('Encrypt and send — confirm in your wallet…');
        const { txHash } = await token.confidentialTransfer(
          params.recipient as `0x${string}`,
          amtWei,
          {
            onEncryptComplete: () => onProgress('Encrypted — submitting transfer…'),
            onTransferSubmitted: (hash) => onProgress(`Transfer: ${shortenAddress(hash)}`),
          },
        );
        if (activity) await sink.update(activity.id, { status: 'success', txHash });
        onProgress(`Sent successfully: ${shortenAddress(txHash)}`);
        return { txHash };
      }
    }

    throw new Error(`Unsupported action: ${action}`);
  } catch (e) {
    const msg = formatRelayerError(e);
    if (activity) await sink.update(activity.id, { status: 'failed', message: msg });
    throw new Error(msg);
  }
}
