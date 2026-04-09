"use client";

import useSWR from "swr";
import {
  parseLatestSignals,
  parsePortfolio,
  parseStats,
  type Portfolio,
  type Stats,
  type KillCriteria,
  type Artifact,
  type Signal,
  type RegimeData,
  type PrismData,
} from "./api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// The /api/portfolio and /api/stats endpoints serialise Decimal values as
// strings; parse them back to numbers here so components can treat the shape
// uniformly as numbers.
const portfolioFetcher = async (url: string): Promise<Portfolio> =>
  parsePortfolio(await fetcher(url));

const statsFetcher = async (url: string): Promise<Stats> =>
  parseStats(await fetcher(url));

const latestSignalsFetcher = async (
  url: string,
): Promise<{ timestamp: string; signals: Signal[] }> =>
  parseLatestSignals(await fetcher(url));

export function usePortfolio() {
  return useSWR<Portfolio>(`${API_BASE}/api/portfolio`, portfolioFetcher, {
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
  return useSWR<Stats>(`${API_BASE}/api/stats`, statsFetcher, {
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
  return useSWR<KillCriteria>(`${API_BASE}/api/kill-criteria`, fetcher, {
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
  return useSWR<Artifact[]>(`${API_BASE}/api/artifacts?limit=${limit}`, fetcher, {
    refreshInterval: 8000,
    fallbackData: [],
  });
}

export function useRegime() {
  return useSWR<RegimeData>(`${API_BASE}/api/regime`, fetcher, {
    refreshInterval: 5000,
    fallbackData: { regime: "unknown", adx: 0, pair: "", timestamp: null },
  });
}

export function useTrades() {
  return useSWR<Artifact[]>(`${API_BASE}/api/trades`, fetcher, {
    refreshInterval: 8000,
    fallbackData: [],
  });
}

export function usePrism(symbol: string) {
  return useSWR<PrismData>(`${API_BASE}/api/prism/${symbol}`, fetcher, {
    refreshInterval: 30000,
    fallbackData: { symbol, signals: null, risk: null },
  });
}

export function useLatestSignals() {
  return useSWR<{ timestamp: string; signals: Signal[] }>(
    `${API_BASE}/api/signals/latest`,
    latestSignalsFetcher,
    { refreshInterval: 5000, fallbackData: { timestamp: "", signals: [] } }
  );
}
