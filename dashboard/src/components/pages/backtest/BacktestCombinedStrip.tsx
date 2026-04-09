"use client";

import { HairlineCard } from "@/components/ui/HairlineCard";
import { MetricCell } from "@/components/ui/MetricCell";
import { NumericValue } from "@/components/ui/NumericValue";
import { useBacktestReport } from "@/lib/hooks";

export function BacktestCombinedStrip() {
  const { data } = useBacktestReport();
  const combined = data?.combined;
  if (!combined) return null;
  return (
    <HairlineCard>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
        <MetricCell
          label="Total PnL"
          emphasis="strong"
          value={
            <NumericValue
              value={combined.total_pnl_usd}
              kind="usd"
              color="auto"
              sign="always"
            />
          }
        />
        <MetricCell
          label="Profit Factor"
          emphasis="strong"
          value={
            <NumericValue
              value={combined.profit_factor}
              kind="ratio"
              decimals={2}
            />
          }
        />
        <MetricCell
          label="Calmar"
          emphasis="strong"
          value={
            <NumericValue value={combined.calmar} kind="ratio" decimals={2} />
          }
        />
        <MetricCell
          label="Max DD"
          emphasis="strong"
          value={
            <NumericValue
              value={combined.max_drawdown_pct / 100}
              kind="pct"
              color="auto"
            />
          }
        />
        <MetricCell
          label="Win Rate"
          emphasis="strong"
          value={
            <NumericValue
              value={combined.win_rate_pct / 100}
              kind="pct"
              decimals={1}
            />
          }
        />
      </div>
    </HairlineCard>
  );
}
