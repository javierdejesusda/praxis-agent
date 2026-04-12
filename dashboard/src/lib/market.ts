"use client";

import useSWR from "swr";

export type MarketTicker = {
  symbol: string;
  price: number;
  change24h: number;
};

type BinanceRow = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
};

type CoinGeckoRow = {
  id: string;
  symbol: string;
  current_price: number;
  price_change_percentage_24h: number | null;
};

const COINS: Array<{ display: string; binance: string; gecko: string }> = [
  { display: "BTC", binance: "BTCUSDT", gecko: "bitcoin" },
  { display: "ETH", binance: "ETHUSDT", gecko: "ethereum" },
  { display: "SOL", binance: "SOLUSDT", gecko: "solana" },
  { display: "BNB", binance: "BNBUSDT", gecko: "binancecoin" },
  { display: "XRP", binance: "XRPUSDT", gecko: "ripple" },
  { display: "ADA", binance: "ADAUSDT", gecko: "cardano" },
  { display: "DOGE", binance: "DOGEUSDT", gecko: "dogecoin" },
  { display: "AVAX", binance: "AVAXUSDT", gecko: "avalanche-2" },
  { display: "DOT", binance: "DOTUSDT", gecko: "polkadot" },
  { display: "LINK", binance: "LINKUSDT", gecko: "chainlink" },
  { display: "MATIC", binance: "MATICUSDT", gecko: "matic-network" },
  { display: "UNI", binance: "UNIUSDT", gecko: "uniswap" },
  { display: "LTC", binance: "LTCUSDT", gecko: "litecoin" },
  { display: "ATOM", binance: "ATOMUSDT", gecko: "cosmos" },
];

const BINANCE_URL =
  "https://api.binance.com/api/v3/ticker/24hr?symbols=" +
  encodeURIComponent(JSON.stringify(COINS.map((c) => c.binance)));

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/coins/markets" +
  "?vs_currency=usd" +
  `&ids=${COINS.map((c) => c.gecko).join(",")}` +
  "&order=market_cap_desc&per_page=50&page=1&sparkline=false" +
  "&price_change_percentage=24h";

async function fetchBinance(): Promise<MarketTicker[]> {
  const res = await fetch(BINANCE_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`binance ${res.status}`);
  const rows = (await res.json()) as BinanceRow[];
  const bySym = new Map<string, BinanceRow>(rows.map((r) => [r.symbol, r]));
  return COINS
    .map((c) => {
      const row = bySym.get(c.binance);
      if (!row) return null;
      return {
        symbol: c.display,
        price: Number(row.lastPrice) || 0,
        change24h: Number(row.priceChangePercent) || 0,
      };
    })
    .filter((t): t is MarketTicker => t !== null);
}

async function fetchCoinGecko(): Promise<MarketTicker[]> {
  const res = await fetch(COINGECKO_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const rows = (await res.json()) as CoinGeckoRow[];
  const byId = new Map<string, CoinGeckoRow>(rows.map((r) => [r.id, r]));
  return COINS
    .map((c) => {
      const row = byId.get(c.gecko);
      if (!row) return null;
      return {
        symbol: c.display,
        price: Number(row.current_price) || 0,
        change24h: Number(row.price_change_percentage_24h ?? 0),
      };
    })
    .filter((t): t is MarketTicker => t !== null);
}

async function fetchMarkets(): Promise<MarketTicker[]> {
  try {
    return await fetchBinance();
  } catch {
    return await fetchCoinGecko();
  }
}

const FALLBACK: MarketTicker[] = COINS.map((c) => ({
  symbol: c.display,
  price: 0,
  change24h: 0,
}));

export function useMarketTickers() {
  return useSWR<MarketTicker[]>("markets:tickers", fetchMarkets, {
    refreshInterval: 30_000,
    fallbackData: FALLBACK,
    revalidateOnFocus: false,
    errorRetryInterval: 15_000,
  });
}

export function fmtTickerPrice(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1000) {
    return n.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }
  if (n >= 1) {
    return n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}
