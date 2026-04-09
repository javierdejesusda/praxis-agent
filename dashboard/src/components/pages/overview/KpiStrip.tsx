"use client";

import { usePortfolio, useStats } from "@/lib/hooks";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { MetricCell } from "@/components/ui/MetricCell";
import { NumericValue } from "@/components/ui/NumericValue";
import { Sparkline } from "@/components/ui/Sparkline";

export function KpiStrip() {
  const { data: portfolio } = usePortfolio();
  const { data: stats } = useStats();
  if (!portfolio || !stats) return null;
  return (
    <HairlineCard>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div>
          <MetricCell
            label="Equity"
            emphasis="strong"
            value={<NumericValue value={portfolio.equity} kind="usd" />}
            delta={{ value: portfolio.total_pnl, unit: "usd" }}
          />
          <div className="mt-2">
            <Sparkline data={[portfolio.peak_equity, portfolio.equity]} tone="auto" />
          </div>
        </div>
        <MetricCell
          label="Drawdown"
          emphasis="strong"
          value={<NumericValue value={portfolio.drawdown_pct} kind="pct" />}
          footnote="max 8%"
        />
        <MetricCell
          label="Trades"
          emphasis="strong"
          value={<NumericValue value={stats.trade_count} kind="int" />}
          footnote={`${stats.rejection_count} rejected`}
        />
        <MetricCell
          label="Validation Rate"
          emphasis="strong"
          value={<NumericValue value={stats.validation_rate / 100} kind="pct" decimals={0} />}
          footnote={`${stats.total_decisions} decisions`}
        />
      </div>
    </HairlineCard>
  );
}
