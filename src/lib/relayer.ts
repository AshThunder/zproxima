import { sepolia, mainnet } from '@zama-fhe/sdk/chains';
import type { FheChain } from '@zama-fhe/sdk/chains';

function isExtensionContext(): boolean {
  if (typeof window !== 'undefined') {
    return window.location.protocol === 'chrome-extension:';
  }
  if (typeof self !== 'undefined') {
    return (self.location?.protocol ?? '') === 'chrome-extension:';
  }
  return false;
}

/**
 * Browser web dApps must proxy RPC calls same-origin (bypasses COEP/CORP restrictions).
 * Extension pages use host_permissions and hit RPC nodes directly.
 */
export function resolveRpcUrl(chainId: number, defaultRpc: string): string {
  const explicit =
    chainId === sepolia.id
      ? import.meta.env.VITE_SEPOLIA_RPC_URL
      : import.meta.env.VITE_MAINNET_RPC_URL;
  if (explicit) return explicit;

  if (isExtensionContext()) return defaultRpc;

  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/rpc/${chainId}`;
  }

  return defaultRpc;
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
  const resolvedRpc = resolveRpcUrl(chainId, networkRpc);
  const proxyUrl = resolveRelayerProxyUrl(chainId);
  const apiKey = import.meta.env.VITE_RELAYER_API_KEY;

  return {
    ...base,
    network: resolvedRpc,
    ...(proxyUrl ? { relayerUrl: proxyUrl } : {}),
    ...(apiKey ? { auth: { __type: 'ApiKeyHeader' as const, value: apiKey } } : {}),
  };
}
