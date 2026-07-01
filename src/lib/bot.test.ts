import { describe, it, expect } from 'vitest';
import { parseBotCommand } from './bot';
import { formatRelayerError } from './relayerAuth';
import { getPriceForSymbol } from './prices';

describe('parseBotCommand', () => {
  it('parses wrap commands', () => {
    const intent = parseBotCommand('wrap 10 usdc');
    expect(intent.action).toBe('wrap');
    expect(intent.amount).toBe('10');
    expect(intent.tokenSymbol).toBe('usdc');
  });

  it('parses unwrap commands', () => {
    const intent = parseBotCommand('unwrap 5 cusdc');
    expect(intent.action).toBe('unwrap');
    expect(intent.amount).toBe('5');
  });

  it('parses send commands', () => {
    const intent = parseBotCommand('send 1 cusdc to 0x1234567890123456789012345678901234567890');
    expect(intent.action).toBe('send');
    expect(intent.recipient).toBe('0x1234567890123456789012345678901234567890');
  });

  it('returns help for greetings', () => {
    expect(parseBotCommand('hello').action).toBe('help');
  });

  it('returns unknown for gibberish', () => {
    expect(parseBotCommand('foobar xyz').action).toBe('unknown');
  });
});

describe('relayerAuth', () => {
  it('formats auth errors for mainnet', () => {
    const msg = formatRelayerError(new Error('401 Unauthorized'));
    expect(msg.length).toBeGreaterThan(0);
  });
});

describe('prices', () => {
  it('resolves token prices by symbol', () => {
    const prices = { usdc: 1, weth: 2500 };
    expect(getPriceForSymbol('cUSDCMock', prices)).toBe(1);
    expect(getPriceForSymbol('cWETHMock', prices)).toBe(2500);
  });

  it('falls back when live price missing', () => {
    expect(getPriceForSymbol('cUSDCMock', {})).toBe(1);
    expect(getPriceForSymbol('eth', {})).toBe(2500);
  });
});
