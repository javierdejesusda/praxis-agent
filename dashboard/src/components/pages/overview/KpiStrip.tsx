"use client";

import React from "react";

import { usePortfolio, useStats } from "@/lib/hooks";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { MetricCell } from "@/components/ui/MetricCell";
import { NumericValue } from "@/components/ui/NumericValue";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Sparkline } from "@/components/ui/Sparkline";
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
      className="kpi-tooltip relative inline-block w-full outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-accent)] rounded-[6px]"
    >
      {children}
      <span
        role="tooltip"
        className="kpi-tooltip-hint pointer-events-none absolute left-0 top-full z-20 mt-1 max-w-[240px] whitespace-normal rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-surface-solid)] px-2.5 py-1.5 text-[10px] font-normal leading-snug text-[color:var(--color-ink-soft)] opacity-0 shadow-[0_2px_8px_var(--color-rule)] transition-opacity duration-150"
      >
        {hint}
      </span>
    </span>
  );
}

export const KpiStrip = React.memo(function KpiStrip() {
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio();
  const { data: stats, isLoading: statsLoading } = useStats();
  const loading = portfolioLoading || statsLoading || !portfolio || !stats;

  if (loading) {
    return (
      <HairlineCard>
        <SectionHeader title="Portfolio" isLoading />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <span className="block text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-muted)]">
                &nbsp;
              </span>
              <SkeletonMetric width={120} />
            </div>
          ))}
        </div>
      </HairlineCard>
    );
  }

  return (
    <HairlineCard>
      <style>{`
        .kpi-tooltip:hover .kpi-tooltip-hint,
        .kpi-tooltip:focus-visible .kpi-tooltip-hint {
          opacity: 1;
        }
      `}</style>
      <SectionHeader title="Portfolio" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
        <div>
          <Tooltip hint="Total account value: cash + open positions, marked to market.">
            <MetricCell
              label="Equity"
              emphasis="strong"
              value={<NumericValue value={portfolio.equity} kind="usd" />}
              delta={{ value: portfolio.total_pnl, unit: "usd" }}
            />
          </Tooltip>
          <div className="mt-3">
            <Sparkline
              data={[portfolio.peak_equity, portfolio.equity]}
              tone="auto"
            />
          </div>
        </div>
        <Tooltip hint="% decline from peak equity. Kill switch at 8%.">
          <MetricCell
            label="Drawdown"
            emphasis="strong"
            value={<NumericValue value={portfolio.drawdown_pct} kind="pct" />}
            footnote="max 8%"
          />
        </Tooltip>
        <Tooltip hint="Total trades executed since session start.">
          <MetricCell
            label="Trades"
            emphasis="strong"
            value={<NumericValue value={stats.trade_count} kind="int" />}
            footnote={`${stats.rejection_count} rejected`}
          />
        </Tooltip>
        <Tooltip hint="Fraction of strategic cycles the governor approved. Higher = more alignment with risk budget.">
          <MetricCell
            label="Validation Rate"
            emphasis="strong"
            value={
              <NumericValue
                value={stats.validation_rate / 100}
                kind="pct"
                decimals={0}
              />
            }
            footnote={`${stats.total_decisions} decisions`}
          />
        </Tooltip>
      </div>
    </HairlineCard>
  );
});
