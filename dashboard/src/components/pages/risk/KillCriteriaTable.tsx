"use client";

import { useKillCriteria, usePortfolio } from "@/lib/hooks";
import { NumericValue } from "@/components/ui/NumericValue";
import { StatusPill } from "@/components/ui/StatusPill";
import { Skeleton } from "@/components/ui/Skeleton";

const STALE_DATA_SECONDS = 7200;
const MAX_DAILY_LOSS_PCT = 0.03;
const MAX_DRAWDOWN_PCT = 0.08;
const MIN_SPREAD_BPS = 20;
const MAX_CONSECUTIVE_LOSSES = 3;

type Row = {
  id: string;
  criterion: string;
  threshold: string;
  current: React.ReactNode;
  tripped: boolean;
};

function formatStaleWindow(seconds: number): string {
  const hours = seconds / 3600;
  if (Number.isInteger(hours)) return `\u2264 ${hours}h`;
  return `\u2264 ${seconds}s`;
}

export function KillCriteriaTable() {
  const { data: kill, isLoading: killLoading } = useKillCriteria();
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio();
  const loading = killLoading || portfolioLoading;

  if (loading) {
    return (
      <div
        role="region"
        aria-label="Kill criteria status"
        aria-busy="true"
        className="px-5 pb-4"
      >
        <div className="grid grid-cols-[1.3fr_1fr_1fr_auto] gap-x-6 gap-y-3 pt-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="contents">
              <Skeleton width="70%" height={12} />
              <Skeleton width="55%" height={12} />
              <Skeleton width="45%" height={12} />
              <Skeleton width={48} height={18} radius={9} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const dailyPnlRatio =
    portfolio && portfolio.equity > 0
      ? portfolio.daily_pnl / portfolio.equity
      : null;

  const rows: Row[] = [
    {
      id: "stale_data",
      criterion: "Data Freshness",
      threshold: formatStaleWindow(STALE_DATA_SECONDS),
      current: "\u2014",
      tripped: Boolean(kill?.stale_data),
    },
    {
      id: "malformed_output",
      criterion: "Output Integrity",
      threshold: "Valid schema",
      current: "\u2014",
      tripped: Boolean(kill?.malformed_output),
    },
    {
      id: "ledger_mismatch",
      criterion: "Ledger Match",
      threshold: "Internal \u2261 Exchange",
      current: "\u2014",
      tripped: Boolean(kill?.ledger_mismatch),
    },
    {
      id: "spread_too_wide",
      criterion: "Spread",
      threshold: `\u2264 ${MIN_SPREAD_BPS} bps`,
      current: "\u2014",
      tripped: Boolean(kill?.spread_too_wide),
    },
    {
      id: "daily_loss_breached",
      criterion: "Daily Loss Cap",
      threshold: (MAX_DAILY_LOSS_PCT * 100).toFixed(2) + "%",
      current:
        dailyPnlRatio !== null ? (
          <NumericValue value={dailyPnlRatio} kind="pct" />
        ) : (
          "\u2014"
        ),
      tripped: Boolean(kill?.daily_loss_breached),
    },
    {
      id: "max_drawdown_breached",
      criterion: "Max Drawdown",
      threshold: (MAX_DRAWDOWN_PCT * 100).toFixed(2) + "%",
      current:
        portfolio !== undefined ? (
          <NumericValue value={portfolio.drawdown_pct} kind="pct" />
        ) : (
          "\u2014"
        ),
      tripped: Boolean(kill?.max_drawdown_breached),
    },
    {
      id: "kill_switch",
      criterion: "Kill Switch",
      threshold: "Manual override off",
      current: "\u2014",
      tripped: Boolean(kill?.kill_switch),
    },
  ];

  void MAX_CONSECUTIVE_LOSSES;

  return (
    <div
      role="region"
      aria-label="Kill criteria status"
      className="px-5 pb-4 overflow-x-auto"
    >
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-[color:var(--color-rule-strong)]">
            <th className="py-2 pr-4 text-left text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-muted)] font-medium">
              Criterion
            </th>
            <th className="py-2 px-4 text-left text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-muted)] font-medium">
              Threshold
            </th>
            <th className="py-2 px-4 text-right text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-muted)] font-medium">
              Current
            </th>
            <th className="py-2 pl-4 text-right text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-muted)] font-medium">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              role="status"
              aria-live="polite"
              aria-label={`${r.criterion}: ${r.tripped ? "tripped" : "ok"}`}
              className="border-b border-[color:var(--color-rule)] last:border-b-0"
            >
              <td className="py-2 pr-4 text-[color:var(--color-ink)]">
                {r.criterion}
              </td>
              <td className="py-2 px-4 num text-[color:var(--color-ink-soft)]">
                {r.threshold}
              </td>
              <td className="py-2 px-4 num text-right text-[color:var(--color-ink-soft)]">
                {r.current}
              </td>
              <td className="py-2 pl-4 text-right">
                <StatusPill
                  tone={r.tripped ? "crit" : "ok"}
                  label={r.tripped ? "TRIP" : "OK"}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
