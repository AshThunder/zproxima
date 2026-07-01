export interface ConfigPair {
  symbol: string;
  name: string;
  underlyingAddress: string;
  confidentialAddress: string;
  decimals: number;
}

// Add your custom or dev-only ERC-20 ↔ ERC-7984 wrapper pairs here.
// These will be merged automatically with the on-chain registry pairs.
export const LOCAL_CONFIG_PAIRS: { sepolia: ConfigPair[]; mainnet: ConfigPair[] } = {
  sepolia: [
    {
      symbol: 'cmUSDC',
      name: 'Confidential Mock USDC',
      underlyingAddress: '0xc252C97B3Ec27f6178c52c200ef47dA50056Babd',
      confidentialAddress: '0x6e37DF2fc456C0005b8451BBc8F05EbD997Ba6F0',
      decimals: 6,
    }
  ],
  mainnet: []
};
