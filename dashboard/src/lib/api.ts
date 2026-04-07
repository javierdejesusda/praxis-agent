const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json();
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

export const api = {
  health: () => fetchApi<{ status: string; timestamp: string }>("/api/health"),
  portfolio: () => fetchApi<Portfolio>("/api/portfolio"),
  artifacts: (limit = 50) => fetchApi<Artifact[]>(`/api/artifacts?limit=${limit}`),
  trades: () => fetchApi<Artifact[]>("/api/trades"),
  rejections: () => fetchApi<Artifact[]>("/api/rejections"),
  signals: () =>
    fetchApi<{ timestamp: string; signals: Signal[]; analyst: unknown; risk_decision: unknown }>(
      "/api/signals/latest"
    ),
  killCriteria: () => fetchApi<KillCriteria>("/api/kill-criteria"),
  stats: () => fetchApi<Stats>("/api/stats"),
  regime: () => fetchApi<RegimeData>("/api/regime"),
};
