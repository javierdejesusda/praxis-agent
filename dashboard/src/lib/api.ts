const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json();
}

// The Python backend serialises Decimal values as strings to preserve
// financial precision (canonical JSON). Parse them back to numbers at the
// fetch boundary so downstream components can treat the types uniformly.
function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function parsePositions(raw: unknown): Portfolio["positions"] {
  if (!raw || typeof raw !== "object") return {};
  const out: Portfolio["positions"] = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const pos = value as Record<string, unknown>;
    out[key] = {
      side: typeof pos.side === "string" ? pos.side : "",
      size_usd: toNumber(pos.size_usd),
      entry_price: toNumber(pos.entry_price),
    };
  }
  return out;
}

export function parsePortfolio(raw: Record<string, unknown>): Portfolio {
  return {
    equity: toNumber(raw.equity),
    cash: toNumber(raw.cash),
    positions: parsePositions(raw.positions),
    daily_pnl: toNumber(raw.daily_pnl),
    total_pnl: toNumber(raw.total_pnl),
    peak_equity: toNumber(raw.peak_equity),
    drawdown_pct: toNumber(raw.drawdown_pct),
    consecutive_losses: toNumber(raw.consecutive_losses),
    trade_count: toNumber(raw.trade_count),
    daily_trade_count: toNumber(raw.daily_trade_count),
  };
}

export function parseStats(raw: Record<string, unknown>): Stats {
  return {
    equity: toNumber(raw.equity),
    total_pnl: toNumber(raw.total_pnl),
    drawdown_pct: toNumber(raw.drawdown_pct),
    trade_count: toNumber(raw.trade_count),
    rejection_count: toNumber(raw.rejection_count),
    total_decisions: toNumber(raw.total_decisions),
    validation_rate: toNumber(raw.validation_rate),
    positions: (raw.positions as Record<string, unknown>) ?? {},
  };
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

export const api = {
  health: () => fetchApi<{ status: string; timestamp: string }>("/api/health"),
  portfolio: async () =>
    parsePortfolio(await fetchApi<Record<string, unknown>>("/api/portfolio")),
  artifacts: (limit = 50) => fetchApi<Artifact[]>(`/api/artifacts?limit=${limit}`),
  trades: () => fetchApi<Artifact[]>("/api/trades"),
  rejections: () => fetchApi<Artifact[]>("/api/rejections"),
  signals: () =>
    fetchApi<{ timestamp: string; signals: Signal[]; analyst: unknown; risk_decision: unknown }>(
      "/api/signals/latest"
    ),
  killCriteria: () => fetchApi<KillCriteria>("/api/kill-criteria"),
  stats: async () =>
    parseStats(await fetchApi<Record<string, unknown>>("/api/stats")),
  regime: () => fetchApi<RegimeData>("/api/regime"),
  prism: (symbol: string) => fetchApi<PrismData>(`/api/prism/${symbol}`),
};
