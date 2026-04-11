"use client";

import { useBacktestReport } from "@/lib/hooks";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { MetricCell } from "@/components/ui/MetricCell";
import { NumericValue } from "@/components/ui/NumericValue";
import { StatusPill } from "@/components/ui/StatusPill";

export function PerformanceStrip() {
  const { data } = useBacktestReport();
  if (!data?.available || !data.combined) {
    return (
      <HairlineCard>
        <SectionHeader title="Backtest Results" />
        <EmptyState label="No backtest report yet." sub="Run scripts/final_report.py to generate results." />
      </HairlineCard>
    );
  }

  const oos = data.out_of_sample;
  const c = oos ?? data.combined;
  const label = oos ? "Out-of-Sample" : "Full History";
  const winTone = c.win_rate_pct >= 50 ? "ok" : c.win_rate_pct >= 40 ? "warn" : "crit";
  const pfTone = (c.profit_factor ?? 0) >= 2 ? "ok" : (c.profit_factor ?? 0) >= 1.5 ? "warn" : "crit";

  return (
    <HairlineCard>
      <SectionHeader
        title={`Backtest Results (${label})`}
        rightSlot={
          <span className="text-[10px] text-[color:var(--color-muted)]">
            Generated {data.generated_at?.split("T")[0]}
          </span>
        }
      />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
        <MetricCell
          label="Total Return"
          value={
            <NumericValue
              value={(c.portfolio_return_pct ?? 0) / 100}
              kind="pct"
              color="auto"
              decimals={1}
              sign="always"
            />
          }
          footnote={c.cagr_pct != null ? `${c.cagr_pct.toFixed(1)}% CAGR` : undefined}
        />
        <MetricCell
          label="Total PnL"
          value={
            <NumericValue
              value={c.total_pnl_usd}
              kind="usd"
              color="auto"
              sign="always"
            />
          }
        />
        <div>
          <MetricCell
            label="Win Rate"
            value={
              <NumericValue
                value={c.win_rate_pct / 100}
                kind="pct"
                decimals={1}
              />
            }
            footnote={`${c.wins}W / ${c.losses}L`}
          />
          <div className="mt-1.5">
            <StatusPill tone={winTone} label={c.win_rate_pct >= 50 ? "STRONG" : "MODERATE"} />
          </div>
        </div>
        <div>
          <MetricCell
            label="Profit Factor"
            value={
              <NumericValue
                value={c.profit_factor ?? 0}
                kind="ratio"
                decimals={2}
              />
            }
          />
          <div className="mt-1.5">
            <StatusPill tone={pfTone} label={(c.profit_factor ?? 0) >= 2 ? "EXCELLENT" : "GOOD"} />
          </div>
        </div>
        <MetricCell
          label="Max Drawdown"
          value={
            <NumericValue
              value={(c.max_drawdown_pct ?? 0) / 100}
              kind="pct"
              decimals={2}
            />
          }
          footnote="cap 8%"
        />
        <MetricCell
          label="Sharpe"
          value={
            <NumericValue
              value={c.sharpe ?? 0}
              kind="ratio"
              decimals={3}
            />
          }
          footnote={c.sortino != null ? `Sortino ${c.sortino.toFixed(2)}` : undefined}
        />
      </div>
    </HairlineCard>
  );
}
