import { fetchRegistryPairs, getZamaSDK, getExternalZamaSDK, claimFaucetMock, claimFaucetWithEthereum, fetchTokenBalances, ensureWrapAllowance, type Eip1193Provider } from './zama';
import { shortenAddress, formatUnitsDisplay, getSigner } from './wallet';
import { savePendingUnshield, clearPendingUnshield, indexedDBStorage } from '@zama-fhe/sdk';
import { ethers } from 'ethers';

export interface BotIntent {
  action: 'wrap' | 'unwrap' | 'faucet' | 'balance' | 'send' | 'help' | 'unknown';
  amount?: string;
  tokenSymbol?: string;
  recipient?: string;
  error?: string;
}

export interface BotMessage {
  id: number;
  sender: 'user' | 'bot';
  text: string;
  status?: 'pending' | 'success' | 'error';
  txHash?: string;
}

export function parseBotCommand(input: string): BotIntent {
  const clean = input.trim().toLowerCase().replace(/[?,!.]/g, '');
  const words = clean.split(/\s+/);

  if (clean.includes('help') || clean === 'hi' || clean === 'hello') {
    return { action: 'help' };
  }

  if (clean.startsWith('send ') || clean.startsWith('transfer ')) {
    const toIndex = words.indexOf('to');
    if (toIndex === -1) {
      return { action: 'send', error: 'Missing recipient. Format: send <amount> <token> to <address>' };
    }
    const amount = words[1];
    const tokenSymbol = words[2];
    const recipient = words[toIndex + 1];

    if (!amount || isNaN(Number(amount))) {
      return { action: 'send', error: 'Invalid or missing amount. Format: send <amount> <token> to <address>' };
    }
    if (!tokenSymbol) {
      return { action: 'send', error: 'Missing token symbol.' };
    }
    if (!recipient || !recipient.startsWith('0x') || recipient.length !== 42) {
      return { action: 'send', error: 'Recipient must be a valid 0x wallet address.' };
    }

    return { action: 'send', amount, tokenSymbol, recipient };
  }

  if (clean.startsWith('wrap ') || clean.startsWith('shield ')) {
    const amount = words[1];
    const tokenSymbol = words[2];
    if (!amount || isNaN(Number(amount))) {
      return { action: 'wrap', error: 'Invalid or missing amount. Format: wrap <amount> <token>' };
    }
    if (!tokenSymbol) {
      return { action: 'wrap', error: 'Missing token symbol. Format: wrap <amount> <token>' };
    }
    return { action: 'wrap', amount, tokenSymbol };
  }

  if (clean.startsWith('unwrap ') || clean.startsWith('unshield ')) {
    const amount = words[1];
    const tokenSymbol = words[2];
    if (!amount || isNaN(Number(amount))) {
      return { action: 'unwrap', error: 'Invalid or missing amount. Format: unwrap <amount> <token>' };
    }
    if (!tokenSymbol) {
      return { action: 'unwrap', error: 'Missing token symbol. Format: unwrap <amount> <token>' };
    }
    return { action: 'unwrap', amount, tokenSymbol };
  }

  if (clean.includes('faucet') || clean.startsWith('mint ') || clean.startsWith('claim ')) {
    let tokenSymbol = 'cusdcmock';
    for (const w of words) {
      if (['usdc', 'usdt', 'weth', 'bron', 'zama', 'tgbp', 'xaut'].some(s => w.includes(s))) {
        tokenSymbol = w;
        break;
      }
    }
    return { action: 'faucet', tokenSymbol };
  }

  if (clean.includes('balance') || clean.startsWith('check ') || clean.startsWith('show ')) {
    let tokenSymbol: string | undefined;
    for (const w of words) {
      if (['usdc', 'usdt', 'weth', 'bron', 'zama', 'tgbp', 'xaut'].some(s => w.includes(s))) {
        tokenSymbol = w;
        break;
      }
    }
    return { action: 'balance', tokenSymbol };
  }

  return { action: 'unknown' };
}

export type BotSigningContext =
  | { mode: 'embedded'; privateKey: string }
  | { mode: 'external'; ethereum: Eip1193Provider };

async function resolveSdk(ctx: BotSigningContext) {
  return ctx.mode === 'embedded'
    ? getZamaSDK(ctx.privateKey)
    : getExternalZamaSDK(ctx.ethereum);
}

async function claimFaucet(ctx: BotSigningContext, underlyingAddress: string, userAddress: string) {
  return ctx.mode === 'embedded'
    ? claimFaucetMock(ctx.privateKey, underlyingAddress, userAddress)
    : claimFaucetWithEthereum(ctx.ethereum, underlyingAddress, userAddress);
}

function findPair(pairs: Awaited<ReturnType<typeof fetchRegistryPairs>>, tokenSymbol: string) {
  return pairs.find(
    (p) =>
      p.symbol.toLowerCase() === tokenSymbol.toLowerCase() ||
      p.symbol.toLowerCase().replace('mock', '') === tokenSymbol.toLowerCase() ||
      p.symbol.toLowerCase().replace('cmock', 'c') === tokenSymbol.toLowerCase() ||
      p.symbol.toLowerCase().replace(/^c/, '') === tokenSymbol.toLowerCase(),
  );
}

export async function executeBotIntent(
  intent: BotIntent,
  ctx: BotSigningContext,
  userAddress: string,
  onProgress: (msg: string) => void,
): Promise<{ text: string; txHash?: string }> {
  if (intent.error) {
    return { text: `Error: ${intent.error}` };
  }

  const registryKey = ctx.mode === 'embedded' ? ctx.privateKey : undefined;
  const pairs = await fetchRegistryPairs(
    registryKey,
    ctx.mode === 'external' ? ctx.ethereum : undefined,
  );

  switch (intent.action) {
    case 'help':
      return {
        text: `ZBot commands:
- Wrap: wrap <amount> <token> (e.g. wrap 10 usdc)
- Unwrap: unwrap <amount> <token> (e.g. unwrap 5 cusdc)
- Faucet: faucet <token> (e.g. faucet usdc)
- Balance: balance <token> (e.g. balance usdc)
- Send: send <amount> <token> to <address>`,
      };

    case 'wrap': {
      onProgress('Resolving token wrapper...');
      const target = findPair(pairs, intent.tokenSymbol!);

      if (!target) {
        return { text: `Error: Token wrapper for "${intent.tokenSymbol}" not found in registry.` };
      }

      onProgress(`Initializing Zama SDK and approving ${intent.amount} ${target.symbol.replace(/^c/, '')}...`);
      const sdk = await resolveSdk(ctx);
      const token = sdk.createWrappedToken(target.confidentialAddress);
      const parsedAmount = ethers.parseUnits(intent.amount!, target.decimals);

      if (ctx.mode === 'embedded') {
        await ensureWrapAllowance(getSigner(ctx.privateKey), target, parsedAmount, onProgress);
      } else {
        const provider = new ethers.BrowserProvider(ctx.ethereum);
        await ensureWrapAllowance(await provider.getSigner(), target, parsedAmount, onProgress);
      }

      onProgress('Shielding tokens (converting to confidential wrapper)...');
      const { txHash } = await token.shield(parsedAmount, {
        approvalStrategy: 'skip',
        onShieldSubmitted: (hash) => onProgress(`Shield transaction submitted: ${shortenAddress(hash)}. Waiting...`),
      });

      return {
        text: `Successfully wrapped ${intent.amount} tokens into ${target.symbol}.`,
        txHash,
      };
    }

    case 'unwrap': {
      onProgress('Resolving token wrapper...');
      const target = findPair(pairs, intent.tokenSymbol!);

      if (!target) {
        return { text: `Error: Token wrapper for "${intent.tokenSymbol}" not found in registry.` };
      }

      onProgress(`Initiating unshield request of ${intent.amount} ${target.symbol} (Phase 1)...`);
      const sdk = await resolveSdk(ctx);
      const token = sdk.createWrappedToken(target.confidentialAddress);
      const parsedAmount = ethers.parseUnits(intent.amount!, target.decimals);

      onProgress('Waiting for FHE decryption proof (Phase 2)...');
      const { txHash } = await token.unshield(parsedAmount, {
        onUnwrapSubmitted: async (hash) => {
          onProgress(`Unwrap request submitted: ${shortenAddress(hash)}. Waiting for threshold proof...`);
          await savePendingUnshield(indexedDBStorage, target.confidentialAddress, hash);
        },
        onFinalizing: () => onProgress('Decryption proof received. Finalizing unwrap claim...'),
        onFinalizeSubmitted: async (hash) => {
          onProgress(`Finalize claim submitted: ${shortenAddress(hash)}. Confirming...`);
          await clearPendingUnshield(indexedDBStorage, target.confidentialAddress);
        },
      });

      return {
        text: `Successfully unwrapped ${intent.amount} ${target.symbol} back to public balance.`,
        txHash,
      };
    }

    case 'faucet': {
      onProgress('Resolving mock token...');
      const target = findPair(pairs, intent.tokenSymbol!);

      if (!target) {
        return { text: `Error: Mock token for "${intent.tokenSymbol}" not found.` };
      }

      onProgress(`Minting 1,000 underlying ${target.symbol.replace(/^c/, '')} mock tokens...`);
      const txHash = await claimFaucet(ctx, target.underlyingAddress, userAddress);
      return {
        text: `Faucet claim success. Minted 1,000 underlying ${target.symbol.replace(/^c/, '')} to your wallet. You can now wrap them.`,
        txHash,
      };
    }

    case 'balance': {
      if (intent.tokenSymbol) {
        const target = findPair(pairs, intent.tokenSymbol);

        if (!target) {
          return { text: `Error: Token "${intent.tokenSymbol}" not found.` };
        }

        onProgress(`Decrypting balance for ${target.symbol}...`);
        const pk = ctx.mode === 'embedded' ? ctx.privateKey : '';
        const bals = await fetchTokenBalances(pk, target, userAddress);
        const pub = formatUnitsDisplay(bals.publicBalance, target.decimals);
        const priv = bals.isLocked ? '**** (session expired)' : formatUnitsDisplay(bals.confidentialBalance, target.decimals);

        return {
          text: `Balances for ${target.symbol}:
- Public: ${pub}
- Confidential: ${priv}`,
        };
      }

      onProgress('Fetching all balances...');
      const lines: string[] = [];
      const pk = ctx.mode === 'embedded' ? ctx.privateKey : '';
      for (const p of pairs.slice(0, 4)) {
        const bals = await fetchTokenBalances(pk, p, userAddress);
        const pub = formatUnitsDisplay(bals.publicBalance, p.decimals);
        const priv = bals.isLocked ? '****' : formatUnitsDisplay(bals.confidentialBalance, p.decimals);
        lines.push(`- ${p.symbol}: Public ${pub} | Confidential ${priv}`);
      }
      return {
        text: `Portfolio balance overview:\n${lines.join('\n')}`,
      };
    }

    case 'send': {
      onProgress('Resolving token wrapper...');
      const target = findPair(pairs, intent.tokenSymbol!);

      if (!target) {
        return { text: `Error: Token wrapper for "${intent.tokenSymbol}" not found in registry.` };
      }

      onProgress(`Encrypting transfer and submitting to ${shortenAddress(intent.recipient!)}...`);
      const sdk = await resolveSdk(ctx);
      const token = sdk.createToken(target.confidentialAddress);
      const parsedAmount = ethers.parseUnits(intent.amount!, target.decimals);

      const { txHash } = await token.confidentialTransfer(intent.recipient! as `0x${string}`, parsedAmount, {
        onEncryptComplete: () => onProgress('Encrypted client-side. Sending transaction...'),
        onTransferSubmitted: (hash) => onProgress(`Transfer transaction submitted: ${shortenAddress(hash)}. Waiting...`),
      });

      return {
        text: `Successfully sent ${intent.amount} ${target.symbol} confidentially to ${shortenAddress(intent.recipient!)}.`,
        txHash,
      };
    }

    default:
      return {
        text: `I didn't understand that. Try:
- wrap 10 usdc
- unwrap 5 cusdc
- balance of usdc
- faucet usdc
- send 1 cusdc to 0x...`,
      };
  }
}

export async function processCommandWithSigning(
  text: string,
  ctx: BotSigningContext,
  userAddress: string,
  onProgress?: (msg: string) => void,
): Promise<{ message: string; txHash?: string }> {
  const intent = parseBotCommand(text);
  const result = await executeBotIntent(intent, ctx, userAddress, onProgress ?? (() => {}));
  return { message: result.text, txHash: result.txHash };
}

export async function processCommand(
  text: string,
  privateKey: string,
  userAddress: string,
  onProgress?: (msg: string) => void,
): Promise<{ message: string; txHash?: string }> {
  return processCommandWithSigning(
    text,
    { mode: 'embedded', privateKey },
    userAddress,
    onProgress,
  );
}
