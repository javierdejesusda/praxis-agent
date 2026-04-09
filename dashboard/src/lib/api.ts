const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json();
}

// The Python backend serialises Decimal values as fixed-precision strings
// (canonical JSON, e.g. "10000.00000000") to preserve financial precision.
// This pattern matches those strings and nothing else: it requires a
// decimal point, so plain integers, ISO timestamps, hex hashes, pair names
// and status codes are all left untouched.
const DECIMAL_STRING = /^-?\d+\.\d+$/;

/**
 * Recursively walks a JSON-parsed value and replaces any string that looks
 * like a canonical Decimal with its numeric form. Non-matching strings,
 * plain numbers, booleans, nulls and object keys are preserved as-is.
 * Applied once at the fetch boundary so downstream components can rely on
 * numeric fields actually being numbers.
 */
export function numberize(value: unknown): unknown {
  if (typeof value === "string") {
    if (DECIMAL_STRING.test(value)) {
      const n = Number(value);
      return Number.isFinite(n) ? n : value;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(numberize);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = numberize(v);
    }
    return out;
  }
  return value;
}

export interface Portfolio {
  equity: number;
  cash: number;
  positions: Record<string, { side: string; size_usd: number; entry_price: number }>;
  daily_pnl: number;
  total_pnl: number;
  peak_equity: number;
  drawdown_pct: number;
  consecutive_losses: number;
  trade_count: number;
  daily_trade_count: number;
}

export interface Signal {
  agent_name: string;
  pair: string;
  direction: string;
  confidence: number;
  evidence: Record<string, unknown>;
}

export interface Artifact {
  type: string;
  agent_id: string;
  timestamp: string;
  hash: string;
  payload: {
    pair?: string;
    signals?: Signal[];
    analyst?: { direction: string; conviction: number; rationale: string; regime_assessment: string };
    risk_decision?: { approved: boolean; reason_codes: string[]; final_size_usd: number; drawdown_pct: number };
    intent?: { intent_id: string; pair: string; side: string; size_usd: number };
    receipt?: { status: string; fill_price: number; order_id?: string };
  };
}

export interface KillCriteria {
  stale_data: boolean;
  malformed_output: boolean;
  ledger_mismatch: boolean;
  spread_too_wide: boolean;
  daily_loss_breached: boolean;
  max_drawdown_breached: boolean;
  kill_switch: boolean;
}

export interface Stats {
  equity: number;
  total_pnl: number;
  drawdown_pct: number;
  trade_count: number;
  rejection_count: number;
  total_decisions: number;
  validation_rate: number;
  positions: Record<string, unknown>;
}

export interface RegimeData {
  regime: string;
  adx: number;
  pair: string;
  timestamp: string | null;
}

export interface PrismData {
  symbol: string;
  signals: {
    data?: Array<{
      overall_signal: string;
      direction: string;
      strength: string;
      bullish_score: number;
      bearish_score: number;
      current_price: number;
      indicators?: Record<string, number>;
    }>;
  } | null;
  risk: {
    daily_volatility?: number;
    annual_volatility?: number;
    sharpe_ratio?: number;
    max_drawdown?: number;
    current_drawdown?: number;
    positive_days_pct?: number;
  } | null;
}

async function fetchNormalized<T>(path: string): Promise<T> {
  return numberize(await fetchApi<unknown>(path)) as T;
}

export const api = {
  health: () => fetchApi<{ status: string; timestamp: string }>("/api/health"),
  portfolio: () => fetchNormalized<Portfolio>("/api/portfolio"),
  artifacts: (limit = 50) => fetchNormalized<Artifact[]>(`/api/artifacts?limit=${limit}`),
  trades: () => fetchNormalized<Artifact[]>("/api/trades"),
  rejections: () => fetchNormalized<Artifact[]>("/api/rejections"),
  signals: () =>
    fetchNormalized<{
      timestamp: string;
      signals: Signal[];
      analyst: unknown;
      risk_decision: unknown;
    }>("/api/signals/latest"),
  killCriteria: () => fetchApi<KillCriteria>("/api/kill-criteria"),
  stats: () => fetchNormalized<Stats>("/api/stats"),
  regime: () => fetchNormalized<RegimeData>("/api/regime"),
  prism: (symbol: string) => fetchNormalized<PrismData>(`/api/prism/${symbol}`),
};
