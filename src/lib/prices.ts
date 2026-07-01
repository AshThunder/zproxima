import { STORAGE_KEYS } from './storageKeys';

const CACHE_KEY = STORAGE_KEYS.priceCache;
const CACHE_TTL_MS = 5 * 60 * 1000;

const COINGECKO_IDS: Record<string, string> = {
  eth: 'ethereum',
  weth: 'weth',
  usdc: 'usd-coin',
  usdt: 'tether',
  bron: 'bron',
  zama: 'zama',
  tgbp: 'truegbp',
  xaut: 'tether-gold',
};

/** Used when CoinGecko is unreachable (common in extensions without network or on rate-limit). */
export const FALLBACK_PRICES: Record<string, number> = {
  eth: 2500,
  weth: 2500,
  usdc: 1,
  usdt: 1,
  bron: 0.5,
  zama: 1.2,
  tgbp: 1.3,
  xaut: 2000,
};

interface PriceCache {
  prices: Record<string, number>;
  fetchedAt: number;
}

function normalizeSymbol(symbol: string): string {
  return symbol.toLowerCase().replace(/^c/, '').replace(/mock$/, '');
}

async function readCache(): Promise<PriceCache | null> {
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PriceCache;
  } catch {
    return null;
  }
}

function writeCache(prices: Record<string, number>): void {
  const cache: PriceCache = { prices, fetchedAt: Date.now() };
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

export async function fetchTokenPrices(): Promise<Record<string, number>> {
  const cached = await readCache();
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return mergePrices(cached.prices);
  }

  const ids = [...new Set(Object.values(COINGECKO_IDS))].join(',');
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data = (await res.json()) as Record<string, { usd?: number }>;

    const live: Record<string, number> = {};
    for (const [symbol, id] of Object.entries(COINGECKO_IDS)) {
      const usd = data[id]?.usd;
      if (typeof usd === 'number' && usd > 0) live[symbol] = usd;
    }
    writeCache(live);
    return mergePrices(live);
  } catch {
    return mergePrices(cached?.prices ?? {});
  }
}

export function getPriceForSymbol(
  symbol: string,
  prices: Record<string, number>,
): number {
  const key = normalizeSymbol(symbol);
  if (prices[key] && prices[key] > 0) return prices[key];
  if (FALLBACK_PRICES[key]) return FALLBACK_PRICES[key];
  if (key === 'eth' && FALLBACK_PRICES.weth) return FALLBACK_PRICES.weth;
  return 0;
}

export function formatUsdValue(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  return `$${safe.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function mergePrices(live: Record<string, number>): Record<string, number> {
  const merged: Record<string, number> = { ...FALLBACK_PRICES };
  for (const [key, value] of Object.entries(live)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      merged[key] = value;
    }
  }
  return merged;
}
