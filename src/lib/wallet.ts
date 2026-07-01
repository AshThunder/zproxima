import { ethers, Wallet } from 'ethers';
import { sepolia, mainnet } from '@zama-fhe/sdk/chains';
import { resolveRpcUrl } from './relayer';

export interface NetworkConfig {
  id: 'sepolia' | 'mainnet';
  name: string;
  rpc: string;
  chainId: number;
  explorer: string;
  symbol: string;
  registryAddress: string;
}

const DEFAULT_RPC = {
  sepolia: sepolia.network,
  mainnet: mainnet.network,
} as const;

export const NETWORKS: Record<string, NetworkConfig> = {
  sepolia: {
    id: 'sepolia',
    name: 'Sepolia Testnet',
    rpc: import.meta.env.VITE_SEPOLIA_RPC_URL || DEFAULT_RPC.sepolia,
    chainId: sepolia.id,
    explorer: 'https://sepolia.etherscan.io',
    symbol: 'ETH',
    registryAddress: sepolia.registryAddress,
  },
  mainnet: {
    id: 'mainnet',
    name: 'Ethereum Mainnet',
    rpc: import.meta.env.VITE_MAINNET_RPC_URL || DEFAULT_RPC.mainnet,
    chainId: mainnet.id,
    explorer: 'https://etherscan.io',
    symbol: 'ETH',
    registryAddress: mainnet.registryAddress,
  },
};

let activeNetworkKey: 'sepolia' | 'mainnet' = 'sepolia';

export function getActiveNetwork(): NetworkConfig {
  return NETWORKS[activeNetworkKey];
}

export function setActiveNetwork(id: 'sepolia' | 'mainnet') {
  activeNetworkKey = id;
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set({ activeNetwork: id });
  }
}

export async function loadSavedNetwork(): Promise<'sepolia' | 'mainnet'> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const result = await chrome.storage.local.get(['activeNetwork']);
    const id = result.activeNetwork as 'sepolia' | 'mainnet' | undefined;
    if (id && id in NETWORKS) {
      activeNetworkKey = id;
    }
  }
  return activeNetworkKey;
}

export function createNewWallet() {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic!.phrase,
  };
}

export function restoreFromMnemonic(mnemonic: string) {
  const wallet = ethers.Wallet.fromPhrase(mnemonic.trim());
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic!.phrase,
  };
}

export function getProvider(): ethers.JsonRpcProvider {
  const network = getActiveNetwork();
  const rpcUrl = resolveRpcUrl(network.chainId, network.rpc);
  return new ethers.JsonRpcProvider(rpcUrl, {
    chainId: network.chainId,
    name: network.name,
  });
}

export function getSigner(privateKey: string): ethers.Wallet {
  return new ethers.Wallet(privateKey, getProvider());
}

export function getAccountByIndex(mnemonic: string, index: number): { address: string; privateKey: string } {
  const path = `m/44'/60'/0'/0/${index}`;
  const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic.trim(), undefined, path);
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
  };
}

export function deriveVaultAccount(mnemonic: string, index = 0): {
  address: string;
  privateKey: string;
  index: number;
} {
  if (index === 0) {
    const wallet = Wallet.fromPhrase(mnemonic.trim());
    return { address: wallet.address, privateKey: wallet.privateKey, index: 0 };
  }
  const acc = getAccountByIndex(mnemonic, index);
  return { ...acc, index };
}

export function shortenAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatUnitsDisplay(
  amount: bigint,
  tokenDecimals: number,
  displayDecimals = 4,
): string {
  try {
    const formatted = ethers.formatUnits(amount, tokenDecimals);
    const [whole, frac = ''] = formatted.split('.');
    const trimmed = frac.slice(0, displayDecimals).replace(/0+$/, '');
    return trimmed ? `${whole}.${trimmed}` : whole;
  } catch {
    return '0';
  }
}
