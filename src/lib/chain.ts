import { sepolia } from '@zama-fhe/sdk/chains';
import type { Eip1193Provider } from './zama';

export const SEPOLIA_CHAIN_ID = sepolia.id;

export function isSepoliaChain(chainId: number): boolean {
  return chainId === SEPOLIA_CHAIN_ID;
}

export async function ensureSepoliaNetwork(ethereum: Eip1193Provider): Promise<number> {
  const chainIdHex = (await ethereum.request({ method: 'eth_chainId' })) as string;
  const chainId = parseInt(chainIdHex, 16);
  if (isSepoliaChain(chainId)) return chainId;

  const targetHex = `0x${SEPOLIA_CHAIN_ID.toString(16)}`;
  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: targetHex }],
    });
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 4902) {
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: targetHex,
          chainName: 'Sepolia',
          nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: [sepolia.network],
          blockExplorerUrls: ['https://sepolia.etherscan.io'],
        }],
      });
    } else {
      throw new Error(
        `Switch your wallet to Sepolia (chain ${SEPOLIA_CHAIN_ID}). You are on chain ${chainId}.`,
      );
    }
  }

  const afterHex = (await ethereum.request({ method: 'eth_chainId' })) as string;
  const after = parseInt(afterHex, 16);
  if (!isSepoliaChain(after)) {
    throw new Error(
      `Switch your wallet to Sepolia (chain ${SEPOLIA_CHAIN_ID}). You are on chain ${after}.`,
    );
  }
  return after;
}
