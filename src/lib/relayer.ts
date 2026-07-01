import { sepolia, mainnet } from '@zama-fhe/sdk/chains';
import type { FheChain } from '@zama-fhe/sdk/chains';

function isExtensionContext(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.runtime?.id;
}

/**
 * Browser web dApps must proxy relayer calls same-origin (Zama SDK RelayerWeb worker
 * sends credentialed fetches). Extension pages use host_permissions and hit Zama directly.
 */
export function resolveRelayerProxyUrl(chainId: number): string | undefined {
  const explicit =
    chainId === sepolia.id
      ? import.meta.env.VITE_RELAYER_PROXY_URL_SEPOLIA
      : import.meta.env.VITE_RELAYER_PROXY_URL_MAINNET;
  if (explicit) return explicit;

  if (isExtensionContext()) return undefined;

  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/relayer/${chainId}`;
  }

  return undefined;
}

/** Build an FHE chain preset with optional RPC override and same-origin relayer proxy. */
export function buildFheChain(chainId: number, networkRpc: string): FheChain {
  const base = chainId === sepolia.id ? sepolia : mainnet;
  const proxyUrl = resolveRelayerProxyUrl(chainId);
  const apiKey = import.meta.env.VITE_RELAYER_API_KEY;

  return {
    ...base,
    network: networkRpc,
    ...(proxyUrl ? { relayerUrl: proxyUrl } : {}),
    ...(apiKey ? { auth: { __type: 'ApiKeyHeader' as const, value: apiKey } } : {}),
  };
}
