import { ethers } from 'ethers';
import { ERC7984_INTERFACE_ID } from '@zama-fhe/sdk';
import { getActiveNetwork, getProvider } from './wallet';
import type { TokenPair, Address } from './zama';

const REGISTRY_ABI = [
  'function getTokenConfidentialTokenPairsLength() view returns (uint256)',
  'function getTokenConfidentialTokenPairsSlice(uint256 fromIndex, uint256 toIndex) view returns (tuple(address tokenAddress, address confidentialTokenAddress, bool isValid)[])',
  'function getTokenAddress(address confidentialWrapperAddress) view returns (bool isValid, address token)',
  'function isConfidentialTokenValid(address confidentialWrapperAddress) view returns (bool isValid)',
] as const;

const ERC20_META_ABI = [
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function decimals() view returns (uint8)',
] as const;

const ERC165_ABI = ['function supportsInterface(bytes4 interfaceId) view returns (bool)'] as const;

interface RawRegistryPair {
  tokenAddress: string;
  confidentialTokenAddress: string;
  isValid: boolean;
}

export function mergeRegistryPairLists(
  defaults: TokenPair[],
  onchain: TokenPair[],
  custom: TokenPair[],
): TokenPair[] {
  const merged = [...defaults];
  for (const pair of onchain) {
    if (!pair.confidentialAddress) continue;
    const exists = merged.some(
      (m) =>
        m.confidentialAddress.toLowerCase() === pair.confidentialAddress.toLowerCase(),
    );
    if (!exists) merged.push(pair);
  }
  for (const pair of custom) {
    const exists = merged.some(
      (m) =>
        m.confidentialAddress.toLowerCase() === pair.confidentialAddress.toLowerCase(),
    );
    if (!exists) merged.push(pair);
  }
  return merged;
}

async function fetchTokenMetadata(
  address: string,
  fallbackSymbol: string,
  fallbackName: string,
): Promise<{ symbol: string; name: string; decimals: number }> {
  try {
    const provider = getProvider();
    const token = new ethers.Contract(address, ERC20_META_ABI, provider);
    const [symbol, name, decimals] = await Promise.all([
      token.symbol().catch(() => fallbackSymbol),
      token.name().catch(() => fallbackName),
      token.decimals().catch(() => 6),
    ]);
    return {
      symbol: String(symbol || fallbackSymbol),
      name: String(name || fallbackName),
      decimals: Number(decimals ?? 6),
    };
  } catch {
    return { symbol: fallbackSymbol, name: fallbackName, decimals: 6 };
  }
}

async function rawPairToTokenPair(raw: RawRegistryPair): Promise<TokenPair | null> {
  if (!raw.isValid || !raw.tokenAddress || !raw.confidentialTokenAddress) return null;
  const underlying = ethers.getAddress(raw.tokenAddress);
  const confidential = ethers.getAddress(raw.confidentialTokenAddress) as Address;
  const confMeta = await fetchTokenMetadata(
    confidential,
    'cTOKEN',
    'Confidential Token',
  );
  const underlyingMeta = await fetchTokenMetadata(underlying, 'TOKEN', 'ERC-20 Token');
  return {
    symbol: confMeta.symbol,
    name: confMeta.name,
    underlyingAddress: underlying as Address,
    confidentialAddress: confidential,
    decimals: underlyingMeta.decimals,
  };
}

/** Read-only on-chain registry fetch (no wallet / SDK required). */
export async function fetchOnChainRegistryPairs(): Promise<TokenPair[]> {
  const network = getActiveNetwork();
  const provider = getProvider();
  const registry = new ethers.Contract(network.registryAddress, REGISTRY_ABI, provider);
  const lengthBn: bigint = await registry.getTokenConfidentialTokenPairsLength();
  const length = Number(lengthBn);
  if (length === 0) return [];

  const pageSize = 50;
  const pairs: TokenPair[] = [];
  for (let from = 0; from < length; from += pageSize) {
    const to = Math.min(from + pageSize, length);
    const slice: RawRegistryPair[] = await registry.getTokenConfidentialTokenPairsSlice(from, to);
    const formatted = await Promise.all(slice.map((row) => rawPairToTokenPair(row)));
    pairs.push(...formatted.filter((p): p is TokenPair => p !== null));
  }
  return pairs;
}

async function isErc7984Token(address: string): Promise<boolean> {
  try {
    const provider = getProvider();
    const token = new ethers.Contract(address, ERC165_ABI, provider);
    return await token.supportsInterface(ERC7984_INTERFACE_ID);
  } catch {
    return false;
  }
}

/**
 * Resolve any ERC-7984 wrapper address to a TokenPair.
 * Checks local registry lists first, then on-chain registry reverse lookup.
 */
export async function resolveConfidentialToken(
  confidentialAddress: string,
  knownPairs: TokenPair[] = [],
): Promise<TokenPair> {
  let normalized: string;
  try {
    normalized = ethers.getAddress(confidentialAddress.trim());
  } catch {
    throw new Error('Enter a valid confidential wrapper address (0x…).');
  }

  const cached = knownPairs.find(
    (p) => p.confidentialAddress.toLowerCase() === normalized.toLowerCase(),
  );
  if (cached) return cached;

  const network = getActiveNetwork();
  const provider = getProvider();
  const registry = new ethers.Contract(network.registryAddress, REGISTRY_ABI, provider);

  const [isValid, underlyingAddress]: [boolean, string] =
    await registry.getTokenAddress(normalized);

  if (isValid && underlyingAddress && underlyingAddress !== ethers.ZeroAddress) {
    const confMeta = await fetchTokenMetadata(normalized, 'cTOKEN', 'Confidential Token');
    const underlyingMeta = await fetchTokenMetadata(
      underlyingAddress,
      'TOKEN',
      'ERC-20 Token',
    );
    return {
      symbol: confMeta.symbol,
      name: confMeta.name,
      underlyingAddress: ethers.getAddress(underlyingAddress) as Address,
      confidentialAddress: normalized as Address,
      decimals: underlyingMeta.decimals,
    };
  }

  const registryValid: boolean = await registry.isConfidentialTokenValid(normalized);
  const is7984 = await isErc7984Token(normalized);
  if (!registryValid && !is7984) {
    throw new Error(
      'This address is not a recognized ERC-7984 confidential token on the current network.',
    );
  }

  const confMeta = await fetchTokenMetadata(normalized, 'cTOKEN', 'Confidential Token');
  return {
    symbol: confMeta.symbol,
    name: confMeta.name,
    underlyingAddress: ethers.ZeroAddress as Address,
    confidentialAddress: normalized as Address,
    decimals: confMeta.decimals,
  };
}
