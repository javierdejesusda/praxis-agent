"use client";

import React from "react";

import { useBacktestReport } from "@/lib/hooks";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { MetricCell } from "@/components/ui/MetricCell";
import { NumericValue } from "@/components/ui/NumericValue";
import { StatusPill } from "@/components/ui/StatusPill";
import { SkeletonMetric } from "@/components/ui/Skeleton";

function Tooltip({
  hint,
  children,
}: {
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <span
      tabIndex={0}
      aria-label={hint}
      title={hint}
      className="perf-tooltip relative inline-block w-full outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-accent)] rounded-[6px]"
    >
      {children}
      <span
        role="tooltip"
        className="perf-tooltip-hint pointer-events-none absolute left-0 top-full z-20 mt-1 max-w-[240px] whitespace-normal rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-surface-solid)] px-2.5 py-1.5 text-[10px] font-normal leading-snug text-[color:var(--color-ink-soft)] opacity-0 shadow-[0_2px_8px_var(--color-rule)] transition-opacity duration-150"
      >
        {hint}
      </span>
    </span>
  );
}

export const PerformanceStrip = React.memo(function PerformanceStrip() {
  const { data, isLoading } = useBacktestReport();

  if (isLoading) {
    return (
      <HairlineCard>
        <SectionHeader title="Backtest Results" isLoading />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <span className="block text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-muted)]">
                &nbsp;
              </span>
              <SkeletonMetric width={110} />
            </div>
          ))}
        </div>
      </HairlineCard>
    );
  }

  if (!data?.available || !data.combined) {
    return (
      <HairlineCard>
        <SectionHeader title="Backtest Results" />
        <EmptyState
          label="No backtest report yet."
          sub="Run scripts/final_report.py to generate results."
        />
      </HairlineCard>
    );
  }

  const oos = data.out_of_sample;
  const c = oos ?? data.combined;
  const label = oos ? "Out-of-Sample" : "Full History";
  const wr = c.win_rate_pct ?? 0;
  const winTone = wr >= 50 ? "ok" : wr >= 40 ? "warn" : "crit";
  const pfTone =
    (c.profit_factor ?? 0) >= 2
      ? "ok"
      : (c.profit_factor ?? 0) >= 1.5
        ? "warn"
        : "crit";

  return (
    <HairlineCard>
      <style>{`
        .perf-tooltip:hover .perf-tooltip-hint,
        .perf-tooltip:focus-visible .perf-tooltip-hint {
          opacity: 1;
        }
      `}</style>
      <SectionHeader
        title={`Backtest Results (${label})`}
        updatedAt={data.generated_at ?? null}
        staleAfterMs={24 * 60 * 60 * 1000}
        rightSlot={
          <span className="text-[10px] text-[color:var(--color-muted)]">
            Generated {data.generated_at?.split("T")[0]}
          </span>
        }
      />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
        <Tooltip hint="Portfolio total return over the backtest period, net of fees.">
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
            footnote={
              c.cagr_pct != null ? `${c.cagr_pct.toFixed(1)}% CAGR` : undefined
            }
          />
        </Tooltip>
        <Tooltip hint="Absolute profit and loss in USD for the backtest window.">
          <MetricCell
            label="Total PnL"
            value={
              <NumericValue
                value={c.total_pnl_usd ?? 0}
                kind="usd"
                color="auto"
                sign="always"
              />
            }
          />
        </Tooltip>
        <div>
          <Tooltip hint="Share of closed trades that were profitable.">
            <MetricCell
              label="Win Rate"
              value={<NumericValue value={wr / 100} kind="pct" decimals={1} />}
              footnote={`${c.wins ?? 0}W / ${c.losses ?? 0}L`}
            />
          </Tooltip>
          <div className="mt-1.5">
            <StatusPill
              tone={winTone}
              label={wr >= 50 ? "STRONG" : "MODERATE"}
            />
          </div>
        </div>
        <div>
          <Tooltip hint="Gross profit divided by gross loss. Above 1.5 is healthy.">
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
          </Tooltip>
          <div className="mt-1.5">
            <StatusPill
              tone={pfTone}
              label={(c.profit_factor ?? 0) >= 2 ? "EXCELLENT" : "GOOD"}
            />
          </div>
        </div>
        <Tooltip hint="Largest peak-to-trough equity decline during the backtest.">
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
        </Tooltip>
        <Tooltip hint="Risk-adjusted return (excess return over volatility).">
          <MetricCell
            label="Sharpe"
            value={
              <NumericValue value={c.sharpe ?? 0} kind="ratio" decimals={3} />
            }
            footnote={
              c.sortino != null ? `Sortino ${c.sortino.toFixed(2)}` : undefined
            }
          />
        </Tooltip>
      </div>
    </HairlineCard>
  );
});
