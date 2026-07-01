import { describe, it, expect } from 'vitest';
import {
  shortenAddress,
  formatUnitsDisplay,
  createNewWallet,
  restoreFromMnemonic,
  deriveVaultAccount,
} from './wallet';

describe('wallet utils', () => {
  describe('shortenAddress', () => {
    it('returns empty string for empty input', () => {
      expect(shortenAddress('')).toBe('');
    });

    it('shortens address correctly', () => {
      const address = '0xc252C97B3Ec27f6178c52c200ef47dA50056Babd';
      expect(shortenAddress(address)).toBe('0xc252...Babd');
    });
  });

  describe('formatUnitsDisplay', () => {
    it('formats numbers with various decimals correctly', () => {
      expect(formatUnitsDisplay(1000000n, 6)).toBe('1');
      expect(formatUnitsDisplay(1500000n, 6)).toBe('1.5');
      expect(formatUnitsDisplay(1234567n, 6, 4)).toBe('1.2345');
      expect(formatUnitsDisplay(0n, 18)).toBe('0');
    });

    it('handles negative or invalid cases gracefully', () => {
      expect(formatUnitsDisplay(-100n, 18)).toBe('-0');
    });
  });

  describe('wallet generation and restoration', () => {
    it('creates a new wallet and restores it successfully', () => {
      const wallet = createNewWallet();
      expect(wallet.address).toBeDefined();
      expect(wallet.privateKey).toBeDefined();
      expect(wallet.mnemonic).toBeDefined();

      const restored = restoreFromMnemonic(wallet.mnemonic);
      expect(restored.address.toLowerCase()).toBe(wallet.address.toLowerCase());
      expect(restored.privateKey).toBe(wallet.privateKey);
    });

    it('derives vault accounts by index correctly', () => {
      const mnemonic = 'test test test test test test test test test test test junk';
      const rootAcc = deriveVaultAccount(mnemonic, 0);
      const firstAcc = deriveVaultAccount(mnemonic, 1);

      expect(rootAcc.address).toBeDefined();
      expect(firstAcc.address).toBeDefined();
      expect(rootAcc.address).not.toBe(firstAcc.address);
    });
  });
});
