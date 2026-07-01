import { getActiveNetwork } from './wallet';

export type NetworkId = 'sepolia' | 'mainnet';

/** Sepolia uses Zama's public testnet relayer — no API key required. */
export function isRelayerConfigured(networkId?: NetworkId): boolean {
  const id = networkId ?? getActiveNetwork().id;
  if (id === 'sepolia') return true;
  return !!(
    import.meta.env.VITE_RELAYER_API_KEY ||
    import.meta.env.VITE_RELAYER_PROXY_URL_MAINNET
  );
}

/** Show setup UI only when mainnet needs an API key or proxy. */
export function shouldShowRelayerSetupBanner(): boolean {
  return getActiveNetwork().id === 'mainnet' && !isRelayerConfigured('mainnet');
}

export function relayerStatusLabel(networkId?: NetworkId): string {
  const id = networkId ?? getActiveNetwork().id;
  if (id === 'sepolia') return 'Testnet (no API key)';
  return isRelayerConfigured('mainnet') ? 'Configured' : 'API key required';
}

function errorMessageChain(error: unknown): string {
  const parts: string[] = [];
  let cur: unknown = error;
  const seen = new Set<unknown>();
  while (cur instanceof Error && !seen.has(cur)) {
    seen.add(cur);
    if (cur.message) parts.push(cur.message);
    cur = cur.cause;
  }
  if (parts.length === 0) return String(error);
  return parts.join(' → ');
}

export function isRateLimitError(error: unknown): boolean {
  const lower = errorMessageChain(error).toLowerCase();
  return (
    lower.includes('rate limit') ||
    lower.includes('rate_limited') ||
    lower.includes('too many requests') ||
    lower.includes('429') ||
    lower.includes('throttled')
  );
}

export function formatRelayerError(error: unknown): string {
  const msg = errorMessageChain(error);
  const lower = msg.toLowerCase();
  const onMainnet = getActiveNetwork().id === 'mainnet';

  if (
    lower.includes('decryption_failed') ||
    lower.includes('decryption failed') ||
    lower.includes('failed to decrypt')
  ) {
    return 'Decryption failed. Reload the extension and try again.';
  }
  if (lower.includes('timed out') || lower.includes('timeout')) {
    return 'FHE worker is still starting (first run compiles WASM and can take 1–2 minutes). Wait and try again.';
  }
  if (lower.includes('configurationerror') || lower.includes('failed to initialize fhe')) {
    const detail = msg.replace(/^ConfigurationError:\s*/i, '').trim();
    if (lower.includes('timed out') || lower.includes('timeout')) {
      return 'Privacy engine is still starting (first launch compiles WASM and can take several minutes). Wait, then try again.';
    }
    return detail || 'Privacy engine failed to start. Rebuild and reload the extension, then try again.';
  }
  if (
    lower.includes('worker') ||
    lower.includes('wasm') ||
    lower.includes('relayer-sdk') ||
    lower.includes('importscripts') ||
    lower.includes('blob:')
  ) {
    return msg || 'FHE worker failed to load. Rebuild and reload the extension, then try again.';
  }
  if (lower.includes('signing rejected') || lower.includes('user rejected') || lower.includes('user denied')) {
    return 'Transaction rejected in wallet.';
  }
  if (lower.includes('balance validation failed') || lower.includes('insufficient balance')) {
    return 'Insufficient confidential balance for this amount. Switch to Sepolia, wrap tokens first, or enter a lower amount.';
  }
  if (
    lower.includes('erc20insufficientbalance') ||
    lower.includes('insufficient funds') ||
    lower.includes('exceeds balance')
  ) {
    return 'Insufficient public ERC-20 balance for this wrap amount.';
  }
  if (lower.includes('token not found in registry') || lower.includes('not a recognized erc-7984')) {
    return 'Token not found in the registry on this network. Add a custom pair or paste a valid ERC-7984 address on the Decrypt screen.';
  }
  if (lower.includes('wrong network') || lower.includes('chain id') || lower.includes('switch metamask')) {
    return 'Wrong network. Switch your wallet to Sepolia (or the selected network) and try again.';
  }
  if (
    lower.includes('insufficient allowance') ||
    lower.includes('erc20insufficientallowance') ||
    msg.includes('0xfb8f41b2')
  ) {
    return 'Token approval is missing or too low. Confirm the ERC-20 approval in your wallet, wait for it to confirm, then try wrap again.';
  }
  if (lower.includes('approval_failed') || lower.includes('approval failed')) {
    return 'Token approval failed. Confirm the approval transaction in your wallet, then try wrap again.';
  }
  if (
    lower.includes('401') ||
    lower.includes('403') ||
    lower.includes('unauthorized') ||
    lower.includes('api key') ||
    lower.includes('forbidden')
  ) {
    return onMainnet
      ? 'Relayer authentication failed. Set VITE_RELAYER_API_KEY or a mainnet proxy URL in .env and rebuild.'
      : 'Could not reach the Zama testnet relayer. Check your connection and reload the extension.';
  }
  if (
    lower.includes('bad json') ||
    lower.includes("didn't response correctly") ||
    lower.includes("didn't respond correctly")
  ) {
    return 'Could not reach the Zama relayer. Reload the page, ensure you are on Sepolia, and wait a minute if rate-limited, then try again.';
  }
  if (isRateLimitError(error)) {
    return 'Zama testnet relayer is temporarily busy (shared rate limit). Wait 3–5 minutes without refreshing, then try again.';
  }
  if (lower.includes('fetch failed') || lower.includes('network')) {
    return 'Could not reach the Zama relayer. Check your network connection and try again.';
  }
  if (lower.includes('relayer not configured')) {
    return onMainnet
      ? 'Mainnet requires VITE_RELAYER_API_KEY or a proxy URL in .env.'
      : msg;
  }
  return msg || 'An unexpected error occurred.';
}
