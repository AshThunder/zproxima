import {
  ZamaSDK,
  indexedDBStorage,
  chromeSessionStorage,
  clearPendingUnshield,
  loadPendingUnshield,
  NoCiphertextError,
  type GenericStorage,
} from '@zama-fhe/sdk';
import { createConfig } from '@zama-fhe/sdk/ethers';
import { web } from '@zama-fhe/sdk/web';
import { sepolia, mainnet } from '@zama-fhe/sdk/chains';
import { getSigner, getActiveNetwork, getProvider } from './wallet';
import { buildFheChain } from './relayer';
import { formatRelayerError } from './relayerAuth';
import type { RegistryPairItem } from './types';
import { ethers } from 'ethers';
import {
  fetchOnChainRegistryPairs,
  mergeRegistryPairLists,
  resolveConfidentialToken,
} from './registry';
import { LOCAL_CONFIG_PAIRS } from '../config/localConfig';

export { resolveConfidentialToken };

// Fallback lists for immediate UI render and registry query failover
export type Address = `0x${string}`;

export interface TokenPair {
  symbol: string;
  name: string;
  underlyingAddress: Address;
  confidentialAddress: Address;
  decimals: number;
  isCustom?: boolean;
}

export const SEPOLIA_OFFICIAL_PAIRS: TokenPair[] = [
  {
    symbol: 'cUSDCMock',
    name: 'Confidential USDC (Mock)',
    underlyingAddress: '0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF',
    confidentialAddress: '0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639',
    decimals: 6,
  },
  {
    symbol: 'cUSDTMock',
    name: 'Confidential USDT (Mock)',
    underlyingAddress: '0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0',
    confidentialAddress: '0x4E7B06D78965594eB5EF5414c357ca21E1554491',
    decimals: 6,
  },
  {
    symbol: 'cWETHMock',
    name: 'Confidential WETH (Mock)',
    underlyingAddress: '0xff54739b16576FA5402F211D0b938469Ab9A5f3F',
    confidentialAddress: '0x46208622DA27d91db4f0393733C8BA082ed83158',
    decimals: 6,
  },
  {
    symbol: 'cBRONMock',
    name: 'Confidential BRON (Mock)',
    underlyingAddress: '0xFf021fB13cA64e5354c62c954b949a88cfDEb25E',
    confidentialAddress: '0xaa5612FA27c927a0c7961f5AEFEE5ba3A0F9C891',
    decimals: 6,
  },
  {
    symbol: 'cZAMAMock',
    name: 'Confidential ZAMA (Mock)',
    underlyingAddress: '0x75355a85c6FB9df5f0C80FF54e8747EEe9a0BF57',
    confidentialAddress: '0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB',
    decimals: 6,
  },
  {
    symbol: 'ctGBPMock',
    name: 'Confidential tGBP (Mock)',
    underlyingAddress: '0x93c931278A2aad1916783F952f94276eA5111442',
    confidentialAddress: '0xfCE5c7069c5525eF6c8C2b2E35A745bA20a2F7CC',
    decimals: 6,
  },
  {
    symbol: 'cXAUtMock',
    name: 'Confidential XAUt (Mock)',
    underlyingAddress: '0x24377AE4AA0C45ecEe71225007f17c5D423dd940',
    confidentialAddress: '0xe4FcF848739845BC81Dee1d5352cf3844F0a60C7',
    decimals: 6,
  },
  {
    symbol: 'ctGBP',
    name: 'Confidential tGBP (Restricted)',
    underlyingAddress: '0xf6Ef9ADB61A48E29E36bc873070A46A3D2667ff3',
    confidentialAddress: '0x167DC962808B32CFFFc7e14B5018c0bE06A3A208',
    decimals: 6,
  },
];

/** Sepolia mock tokens with public `mint()` — used by the testnet faucet. */
export const SEPOLIA_FAUCET_PAIRS: TokenPair[] = SEPOLIA_OFFICIAL_PAIRS.filter(
  (p) => p.symbol.endsWith('Mock'),
);

export const MAINNET_OFFICIAL_PAIRS: TokenPair[] = [
  {
    symbol: 'cUSDC',
    name: 'Confidential USDC',
    underlyingAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    confidentialAddress: '0xe978F22157048E5DB8E5d07971376e86671672B2',
    decimals: 6,
  },
  {
    symbol: 'cUSDT',
    name: 'Confidential USDT',
    underlyingAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    confidentialAddress: '0xAe0207C757Aa2B4019Ad96edD0092ddc63EF0c50',
    decimals: 6,
  },
  {
    symbol: 'cWETH',
    name: 'Confidential WETH',
    underlyingAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    confidentialAddress: '0xda9396b82634Ea99243cE51258B6A5Ae512D4893',
    decimals: 6,
  },
  {
    symbol: 'cBRON',
    name: 'Confidential BRON',
    underlyingAddress: '0xBA2C598E11eD093079cC324FCa5BbbA99F616E83',
    confidentialAddress: '0x85dE671c3bec1aDeD752c3Cea943521181C826bc',
    decimals: 6,
  },
  {
    symbol: 'cZAMA',
    name: 'Confidential ZAMA',
    underlyingAddress: '0xA12CC123ba206d4031D1c7f6223D1C2Ec249f4f3',
    confidentialAddress: '0x80CB147Fd86dC6dEe3Eee7e4Cee33d1397d98071',
    decimals: 6,
  },
  {
    symbol: 'ctGBP',
    name: 'Confidential tGBP',
    underlyingAddress: '0x27f6c8289550fce67f6b50bed1f519966afe5287',
    confidentialAddress: '0xa873750ccBafD5ec7Dd13bfD5237d7129832eDD9',
    decimals: 6,
  },
  {
    symbol: 'cXAUt',
    name: 'Confidential XAUt',
    underlyingAddress: '0x68749665FF8D2d112Fa859AA293F07A622782F38',
    confidentialAddress: '0x73cc9aF9d6BEFdb3c3fAf8a5E8c05Cb95FdaEEf1',
    decimals: 6,
  },
];

import type { EIP1193Provider } from 'viem';

export type Eip1193Provider = EIP1193Provider;

let sdkInstance: ZamaSDK | null = null;
let currentPrivateKey: string | null = null;
let currentNetworkId: string | null = null;
let sdkInitPromise: Promise<ZamaSDK> | null = null;
let externalSdkInstance: ZamaSDK | null = null;
let externalSdkInitPromise: Promise<ZamaSDK> | null = null;

let fheProgressCallback: ((message: string) => void) | null = null;

/** Wire UI progress during FHE worker boot, credential creation, and decrypt. */
export function setFheProgressCallback(cb: ((message: string) => void) | null): void {
  fheProgressCallback = cb;
}

function emitFheProgress(message: string): void {
  fheProgressCallback?.(message);
}

function mapSdkEventToProgress(type: string): string | null {
  switch (type) {
    case 'decrypt:start':
      return 'Decrypting balance…';
    case 'encrypt:start':
      return 'Authorizing decrypt…';
    default:
      return null;
  }
}

type SdkAuth = { ethereum: Eip1193Provider } | { signer: ethers.Signer };

function buildSdkConfig(auth: SdkAuth, storage: GenericStorage, permitStorage: GenericStorage) {
  const sepoliaRpc = import.meta.env.VITE_SEPOLIA_RPC_URL || sepolia.network;
  const mainnetRpc = import.meta.env.VITE_MAINNET_RPC_URL || mainnet.network;
  const sepoliaChain = buildFheChain(sepolia.id, sepoliaRpc);
  const mainnetChain = buildFheChain(mainnet.id, mainnetRpc);

  const isChromeExt = typeof chrome !== 'undefined' && !!chrome.storage?.session;
  const webOpts = {
    security: { integrityCheck: false as const },
    ...(isChromeExt ? { threads: 1 } : {}),
  };

  return createConfig({
    chains: [sepoliaChain, mainnetChain],
    relayers: {
      [sepolia.id]: web(webOpts),
      [mainnet.id]: web(webOpts),
    },
    ...auth,
    storage,
    permitStorage,
    permitTTL: 365,
    transportKeyPairTTL: 365 * 86400,
    onEvent: (event) => {
      const msg = mapSdkEventToProgress(event.type);
      if (msg) emitFheProgress(msg);
    },
  });
}

/** Terminate the cached SDK instance (e.g. on lock or network switch). */
export function resetZamaSDK(): void {
  if (sdkInstance) {
    try {
      sdkInstance.terminate();
    } catch (e) {
      console.warn('Failed to terminate Zama SDK', e);
    }
  }
  sdkInstance = null;
  currentPrivateKey = null;
  currentNetworkId = null;
  sdkInitPromise = null;

}

export function resetExternalZamaSDK(): void {
  if (externalSdkInstance) {
    try {
      externalSdkInstance.terminate();
    } catch (e) {
      console.warn('Failed to terminate external Zama SDK', e);
    }
  }
  externalSdkInstance = null;
  externalSdkInitPromise = null;

}

export async function getZamaSDK(privateKey: string): Promise<ZamaSDK> {
  const activeNet = getActiveNetwork();
  if (sdkInstance && currentPrivateKey === privateKey && currentNetworkId === activeNet.id) {
    return sdkInstance;
  }

  if (!sdkInitPromise) {
    sdkInitPromise = (async () => {
      resetZamaSDK();

      currentPrivateKey = privateKey;
      currentNetworkId = activeNet.id;
      const wallet = getSigner(privateKey);

      const isChromeExt = typeof chrome !== 'undefined' && !!chrome.storage?.session;
      const permitStorage = isChromeExt && chromeSessionStorage ? chromeSessionStorage : indexedDBStorage;

      sdkInstance = new ZamaSDK(buildSdkConfig({ signer: wallet }, permitStorage, permitStorage));

      return sdkInstance;
    })().finally(() => {
      sdkInitPromise = null;
    });
  }

  return sdkInitPromise;
}

/** MetaMask / browser wallet path — no extension FHE worker patches. */
export async function getExternalZamaSDK(ethereum: Eip1193Provider): Promise<ZamaSDK> {
  if (externalSdkInstance) {
    return externalSdkInstance;
  }

  if (!externalSdkInitPromise) {
    externalSdkInitPromise = (async () => {
      resetExternalZamaSDK();

      externalSdkInstance = new ZamaSDK(
        buildSdkConfig({ ethereum }, indexedDBStorage, indexedDBStorage),
      );

      return externalSdkInstance;
    })().finally(() => {
      externalSdkInitPromise = null;
    });
  }

  return externalSdkInitPromise;
}

async function decryptTokenBalance(
  sdk: ZamaSDK,
  pair: TokenPair,
  ownerAddress: string,
): Promise<bigint> {
  if (pair.isCustom) {
    try {
      const provider = getProvider();
      if (pair.confidentialAddress === ethers.ZeroAddress) {
        return 0n;
      }
      const code = await provider.getCode(pair.confidentialAddress);
      if (code === '0x' || code === '0x0') {
        return 0n;
      }
      const erc20 = new ethers.Contract(
        pair.confidentialAddress,
        ['function balanceOf(address) view returns (uint256)'],
        provider,
      );
      return await erc20.balanceOf(ownerAddress);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`Failed to fetch custom token balance for ${pair.symbol}: ${msg.split('\n')[0]}`);
      return 0n;
    }
  }

  const token = sdk.createToken(pair.confidentialAddress);
  const owner = ownerAddress as Address;

  try {
    return await token.balanceOf(owner);
  } catch (e) {
    if (isNoCiphertextError(e)) {
      return 0n;
    }
    throw e;
  }
}

export async function getReadyZamaSDK(privateKey: string): Promise<ZamaSDK> {
  const sdk = await getZamaSDK(privateKey);
  return sdk;
}

export async function ensureFheEngineReady(privateKey: string): Promise<void> {
  await getZamaSDK(privateKey);
}

export async function fetchRegistryPairs(
  privateKey?: string,
  ethereum?: Eip1193Provider,
): Promise<TokenPair[]> {
  const activeNet = getActiveNetwork();
  const defaults = activeNet.id === 'sepolia' ? SEPOLIA_OFFICIAL_PAIRS : MAINNET_OFFICIAL_PAIRS;
  const custom = await getCustomPairs(activeNet.id);
  const localConfigRaw = LOCAL_CONFIG_PAIRS[activeNet.id] || [];
  const localConfigPairs: TokenPair[] = localConfigRaw.map((p) => ({
    symbol: p.symbol,
    name: p.name,
    underlyingAddress: p.underlyingAddress as Address,
    confidentialAddress: p.confidentialAddress as Address,
    decimals: p.decimals,
    isCustom: true,
  }));

  let onchain: TokenPair[] = [];

  try {
    if (privateKey) {
      const sdk = await getZamaSDK(privateKey);
      const result = await sdk.registry.listPairs({ page: 1, pageSize: 100, metadata: true });
      onchain = result.items
        .filter((p: RegistryPairItem) => p.tokenAddress && p.confidentialTokenAddress)
        .map((p: RegistryPairItem) => ({
          symbol: p.confidential?.symbol || 'cTOKEN',
          name: p.confidential?.name || 'Confidential Token Wrapper',
          underlyingAddress: p.tokenAddress as Address,
          confidentialAddress: p.confidentialTokenAddress as Address,
          decimals: Number(p.underlying?.decimals ?? p.confidential?.decimals ?? 6),
        }));
    } else if (ethereum) {
      const sdk = await getExternalZamaSDK(ethereum);
      const result = await sdk.registry.listPairs({ page: 1, pageSize: 100, metadata: true });
      onchain = result.items
        .filter((p: RegistryPairItem) => p.tokenAddress && p.confidentialTokenAddress)
        .map((p: RegistryPairItem) => ({
          symbol: p.confidential?.symbol || 'cTOKEN',
          name: p.confidential?.name || 'Confidential Token Wrapper',
          underlyingAddress: p.tokenAddress as Address,
          confidentialAddress: p.confidentialTokenAddress as Address,
          decimals: Number(p.underlying?.decimals ?? p.confidential?.decimals ?? 6),
        }));
    } else {
      onchain = await fetchOnChainRegistryPairs();
    }
  } catch (e) {
    console.error('Failed to fetch on-chain registry, falling back to local list:', e);
    try {
      onchain = await fetchOnChainRegistryPairs();
    } catch (fallbackErr) {
      console.error('Read-only registry fetch failed:', fallbackErr);
    }
  }

  return mergeRegistryPairLists(defaults, onchain, [...localConfigPairs, ...custom]);
}

export async function getCustomPairs(networkId: 'sepolia' | 'mainnet'): Promise<TokenPair[]> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const result = await chrome.storage.local.get([`custom_pairs_${networkId}`]);
    return result[`custom_pairs_${networkId}`] || [];
  }
  const raw = localStorage.getItem(`custom_pairs_${networkId}`);
  return raw ? JSON.parse(raw) : [];
}

export async function addCustomPair(networkId: 'sepolia' | 'mainnet', pair: TokenPair): Promise<void> {
  const current = await getCustomPairs(networkId);
  const updated = [...current, { ...pair, isCustom: true }];
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [`custom_pairs_${networkId}`]: updated });
  } else {
    localStorage.setItem(`custom_pairs_${networkId}`, JSON.stringify(updated));
  }
}

export async function removeCustomPair(networkId: 'sepolia' | 'mainnet', confidentialAddress: string): Promise<void> {
  const current = await getCustomPairs(networkId);
  const updated = current.filter(
    (p) => p.confidentialAddress.toLowerCase() !== confidentialAddress.toLowerCase()
  );
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [`custom_pairs_${networkId}`]: updated });
  } else {
    localStorage.setItem(`custom_pairs_${networkId}`, JSON.stringify(updated));
  }
}

function isNoCiphertextError(e: unknown): boolean {
  if (e instanceof NoCiphertextError) return true;
  if (e instanceof Error && (e.name === 'NoCiphertextError' || e.message?.toLowerCase().includes('no ciphertext'))) {
    return true;
  }
  return false;
}

export async function fetchPublicBalance(pair: TokenPair, ownerAddress: string): Promise<bigint> {
  try {
    const provider = getProvider();
    if (pair.underlyingAddress === ethers.ZeroAddress) {
      return 0n;
    }
    const code = await provider.getCode(pair.underlyingAddress);
    if (code === '0x' || code === '0x0') {
      return 0n;
    }
    const erc20 = new ethers.Contract(
      pair.underlyingAddress,
      ['function balanceOf(address) view returns (uint256)'],
      provider,
    );
    return await erc20.balanceOf(ownerAddress);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`Failed to fetch public balance for ${pair.symbol}: ${msg.split('\n')[0]}`);
    return 0n;
  }
}

async function isPrivateBalanceLocked(_privateKey: string, _pair: TokenPair): Promise<boolean> {
  // Private balances are revealed only after the user taps the key (decrypt flow).
  return true;
}


async function tryConfidentialBalance(
  privateKey: string,
  pair: TokenPair,
  ownerAddress: string,
  options: { autoAllow: boolean; throwOnError?: boolean },
): Promise<{ confidentialBalance: bigint; isLocked: boolean }> {
  try {
    const sdk = await getZamaSDK(privateKey);
    const confidentialBalance = await decryptTokenBalance(sdk, pair, ownerAddress);
    return { confidentialBalance, isLocked: false };
  } catch (e) {
    if (options.throwOnError) throw e;
    console.warn(`Failed to decrypt confidential balance for ${pair.symbol}:`, e);
    return { confidentialBalance: 0n, isLocked: true };
  }
}

async function fetchConfidentialBalance(
  privateKey: string,
  pair: TokenPair,
  ownerAddress: string,
  options: { autoAllow: boolean; throwOnError?: boolean },
): Promise<{ confidentialBalance: bigint; isLocked: boolean }> {
  if (pair.isCustom) {
    const bal = await decryptTokenBalance(null as any, pair, ownerAddress);
    return { confidentialBalance: bal, isLocked: false };
  }
  if (!options.autoAllow) {
    try {
      const sdk = await getZamaSDK(privateKey);
      const allowed = await sdk.permits.hasPermit([pair.confidentialAddress]);
      return { confidentialBalance: 0n, isLocked: !allowed };
    } catch {
      return { confidentialBalance: 0n, isLocked: true };
    }
  }
  return tryConfidentialBalance(privateKey, pair, ownerAddress, options);
}

export async function fetchTokenBalances(
  privateKey: string,
  pair: TokenPair,
  ownerAddress: string,
  options?: { autoAllow?: boolean; includePrivate?: boolean },
): Promise<{ publicBalance: bigint; confidentialBalance: bigint; isLocked: boolean }> {
  const autoAllow = options?.autoAllow ?? true;
  const includePrivate = options?.includePrivate ?? true;
  const publicBalance = await fetchPublicBalance(pair, ownerAddress);

  if (!includePrivate) {
    const isLocked = await isPrivateBalanceLocked(privateKey, pair);
    return { publicBalance, confidentialBalance: 0n, isLocked };
  }

  if (!privateKey) {
    return { publicBalance, confidentialBalance: 0n, isLocked: true };
  }

  const { confidentialBalance, isLocked } = await fetchConfidentialBalance(
    privateKey,
    pair,
    ownerAddress,
    {
      autoAllow,
      throwOnError: false,
    },
  );

  return { publicBalance, confidentialBalance, isLocked };
}

export async function decryptConfidentialBalance(
  privateKey: string,
  pair: TokenPair,
  ownerAddress: string,
): Promise<{ publicBalance: bigint; confidentialBalance: bigint; isLocked: boolean }> {
  const publicBalance = await fetchPublicBalance(pair, ownerAddress);
  const sdk = await getZamaSDK(privateKey);
  const confidentialBalance = await decryptTokenBalance(sdk, pair, ownerAddress);
  return { publicBalance, confidentialBalance, isLocked: false };
}

export async function decryptConfidentialBalanceExternal(
  ethereum: Eip1193Provider,
  pair: TokenPair,
  ownerAddress: string,
): Promise<{ publicBalance: bigint; confidentialBalance: bigint; isLocked: boolean }> {
  const publicBalance = pair.underlyingAddress !== ethers.ZeroAddress
    ? await fetchPublicBalance(pair, ownerAddress)
    : 0n;
  const sdk = await getExternalZamaSDK(ethereum);
  const confidentialBalance = await decryptTokenBalance(sdk, pair, ownerAddress);
  return { publicBalance, confidentialBalance, isLocked: false };
}

/** Decrypt balance for any ERC-7984 wrapper (registry or paste-address). */
export async function decryptConfidentialBalanceByAddress(
  confidentialAddress: string,
  ownerAddress: string,
  signing: { privateKey?: string; ethereum?: Eip1193Provider },
  knownPairs: TokenPair[] = [],
): Promise<{ pair: TokenPair; confidentialBalance: bigint }> {
  const pair = await resolveConfidentialToken(confidentialAddress, knownPairs);
  const result = signing.privateKey
    ? await decryptConfidentialBalance(signing.privateKey, pair, ownerAddress)
    : signing.ethereum
      ? await decryptConfidentialBalanceExternal(signing.ethereum, pair, ownerAddress)
      : (() => { throw new Error('Connect a wallet to decrypt balances.'); })();
  return { pair, confidentialBalance: result.confidentialBalance };
}

export async function checkAndResumeUnshields(
  privateKey: string,
  pairs: TokenPair[],
  onProgress?: (msg: string) => void,
): Promise<void> {
  try {
    const sdk = await getZamaSDK(privateKey);
    const storage = indexedDBStorage;

    for (const pair of pairs) {
      try {
        const pending = await loadPendingUnshield(storage, pair.confidentialAddress);
        if (pending) {
          if (onProgress) onProgress(`Found pending unshield for ${pair.symbol}. Resuming...`);
          const token = sdk.createWrappedToken(pair.confidentialAddress);
          await token.resumeUnshield(pending);
          await clearPendingUnshield(storage, pair.confidentialAddress);
          if (onProgress) onProgress(`Finalized unshield for ${pair.symbol}!`);
        }
      } catch (e) {
        console.warn(`Failed to resume unshield for ${pair.symbol}:`, e);
        // Clear so we don't loop endlessly on corrupted transactions
        await clearPendingUnshield(storage, pair.confidentialAddress);
      }
    }
  } catch (err) {
    console.error('Failed to run checkAndResumeUnshields:', err);
  }
}

export async function resumePendingUnshield(
  privateKey: string,
  pair: TokenPair,
): Promise<string> {
  const sdk = await getZamaSDK(privateKey);
  const pending = await loadPendingUnshield(indexedDBStorage, pair.confidentialAddress);
  if (!pending) throw new Error('No pending unshield for this token.');
  const token = sdk.createWrappedToken(pair.confidentialAddress);
  const { txHash } = await token.resumeUnshield(pending);
  await clearPendingUnshield(indexedDBStorage, pair.confidentialAddress);
  return txHash;
}

export { formatRelayerError };

const ERC20_ALLOWANCE_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
] as const;

/** Ensure the confidential wrapper can pull underlying tokens before shield(). */
export async function ensureWrapAllowance(
  signer: ethers.Signer,
  pair: TokenPair,
  amount: bigint,
  onProgress?: (msg: string) => void,
): Promise<void> {
  const owner = await signer.getAddress();
  const underlying = new ethers.Contract(pair.underlyingAddress, ERC20_ALLOWANCE_ABI, signer);
  const allowance: bigint = await underlying.allowance(owner, pair.confidentialAddress);
  if (allowance >= amount) return;

  onProgress?.('Step 1 — approve token spending in your wallet…');
  const tx = await underlying.approve(pair.confidentialAddress, ethers.MaxUint256);
  onProgress?.(`Approval submitted: ${tx.hash.slice(0, 10)}…`);
  await tx.wait();
  onProgress?.('Approval confirmed — submitting wrap…');
}

export async function claimFaucetMock(
  privateKey: string,
  underlyingAddress: string,
  userAddress: string,
  amount: bigint = 1000n * 10n**6n, // 1,000 Mock Tokens
): Promise<string> {
  const wallet = getSigner(privateKey);
  return claimFaucetWithSigner(wallet, underlyingAddress, userAddress, amount);
}

export async function claimFaucetWithEthereum(
  ethereum: Eip1193Provider,
  underlyingAddress: string,
  userAddress: string,
  amount: bigint = 1000n * 10n**6n,
): Promise<string> {
  const provider = new ethers.BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  return claimFaucetWithSigner(signer, underlyingAddress, userAddress, amount);
}

async function claimFaucetWithSigner(
  signer: ethers.Signer,
  underlyingAddress: string,
  userAddress: string,
  amount: bigint,
): Promise<string> {
  const mockToken = new ethers.Contract(
    underlyingAddress,
    ['function mint(address to, uint256 amount) external returns (bool)'],
    signer,
  );
  const tx = await mockToken.mint(userAddress, amount);
  await tx.wait();
  return tx.hash;
}
