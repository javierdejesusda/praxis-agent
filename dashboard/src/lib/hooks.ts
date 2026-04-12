"use client";

import useSWR from "swr";
import {
  numberize,
  type Portfolio,
  type Stats,
  type KillCriteria,
  type Artifact,
  type Signal,
  type RegimeData,
  type PrismData,
  type PriceSeries,
  type LiveQuote,
  type OnchainStatus,
  type BacktestReport,
  type Attestation,
} from "./api";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://praxis-agent-copy-production.up.railway.app";

// Single shared SWR fetcher that recursively converts canonical Decimal
// strings from the Python backend into numbers before components see
// them. Used everywhere a response may contain Decimal-serialised values.
async function numericFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  return numberize(json) as T;
}

// Raw fetcher for endpoints with no Decimal content (booleans/strings
// only) — keeps the payload untouched.
const rawFetcher = <T>(url: string): Promise<T> =>
  fetch(url).then((r) => r.json());

export function usePortfolio() {
  return useSWR<Portfolio>(`${API_BASE}/api/portfolio`, numericFetcher, {
    refreshInterval: 5000,
    fallbackData: {
      equity: 10000,
      cash: 10000,
      positions: {},
      daily_pnl: 0,
      total_pnl: 0,
      peak_equity: 10000,
      drawdown_pct: 0,
      consecutive_losses: 0,
      trade_count: 0,
      daily_trade_count: 0,
    },
  });
}

export function useStats() {
  return useSWR<Stats>(`${API_BASE}/api/stats`, numericFetcher, {
    refreshInterval: 5000,
    fallbackData: {
      equity: 10000,
      total_pnl: 0,
      drawdown_pct: 0,
      trade_count: 0,
      rejection_count: 0,
      total_decisions: 0,
      validation_rate: 0,
      positions: {},
    },
  });
}

export function useKillCriteria() {
  return useSWR<KillCriteria>(`${API_BASE}/api/kill-criteria`, rawFetcher, {
    refreshInterval: 3000,
    fallbackData: {
      stale_data: false,
      malformed_output: false,
      ledger_mismatch: false,
      spread_too_wide: false,
      daily_loss_breached: false,
      max_drawdown_breached: false,
      kill_switch: false,
    },
  });
}

export function useArtifacts(limit = 30) {
  return useSWR<Artifact[]>(
    `${API_BASE}/api/artifacts?limit=${limit}`,
    numericFetcher,
    { refreshInterval: 8000, fallbackData: [] },
  );
}

export function useRegime() {
  return useSWR<RegimeData>(`${API_BASE}/api/regime`, numericFetcher, {
    refreshInterval: 5000,
    fallbackData: { regime: "unknown", adx: 0, pair: "", timestamp: null },
  });
}

export function useTrades() {
  return useSWR<Artifact[]>(`${API_BASE}/api/trades`, numericFetcher, {
    refreshInterval: 8000,
    fallbackData: [],
  });
}

export function usePrism(symbol: string) {
  return useSWR<PrismData>(`${API_BASE}/api/prism/${symbol}`, numericFetcher, {
    refreshInterval: 30000,
    fallbackData: { symbol, signals: null, risk: null },
  });
}

export function useLatestSignals() {
  return useSWR<{ timestamp: string; signals: Signal[] }>(
    `${API_BASE}/api/signals/latest`,
    numericFetcher,
    { refreshInterval: 5000, fallbackData: { timestamp: "", signals: [] } },
  );
}

export function useOnchainStatus() {
  return useSWR<OnchainStatus>(`${API_BASE}/api/onchain/status`, numericFetcher, {
    refreshInterval: 8000,
    fallbackData: {
      enabled: false,
      total_onchain_trades: 0,
      trades: [],
      attestation_totals: { validation: 0, reputation: 0, trade_intent: 0 },
      total_attestations: 0,
      recent_attestations: [],
    },
  });
}

export function useBacktestReport() {
  return useSWR<BacktestReport>(`${API_BASE}/api/backtest`, numericFetcher, {
    refreshInterval: 60000,
    fallbackData: { available: false },
  });
}

export function useAttestations() {
  return useSWR<{ total: number; records: Attestation[] }>(
    `${API_BASE}/api/attestations`,
    numericFetcher,
    { refreshInterval: 8000, fallbackData: { total: 0, records: [] } },
  );
}

export function usePrices(pair: string, interval = 60, limit = 120) {
  return useSWR<PriceSeries>(
    `${API_BASE}/api/prices/${pair}?interval=${interval}&limit=${limit}`,
    numericFetcher,
    {
      refreshInterval: 60000,
      fallbackData: { pair, interval, candles: [] },
    },
  );
}

export function useQuote(pair: string) {
  return useSWR<LiveQuote>(
    `${API_BASE}/api/quote/${pair}`,
    numericFetcher,
    {
      refreshInterval: 3000,
      fallbackData: { pair, ts: "" },
    },
  );
}
