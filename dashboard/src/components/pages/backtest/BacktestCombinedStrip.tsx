"use client";

import { HairlineCard } from "@/components/ui/HairlineCard";
import { MetricCell } from "@/components/ui/MetricCell";
import { NumericValue } from "@/components/ui/NumericValue";
import { useBacktestReport } from "@/lib/hooks";

export function BacktestCombinedStrip() {
  const { data } = useBacktestReport();
  const c = data?.combined;
  if (!c) return null;
  const initialEquity = data?.initial_equity;
  return (
    <div className="space-y-4">
      <HairlineCard>
        <div className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-muted)] font-medium mb-4">
          Performance
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-6">
          <MetricCell
            label="Initial Equity"
            emphasis="strong"
            value={<NumericValue value={initialEquity ?? 10000} kind="usd" />}
          />
          <MetricCell
            label="Final Equity"
            emphasis="strong"
            value={<NumericValue value={c.final_equity ?? 0} kind="usd" />}
          />
          <MetricCell
            label="Total PnL"
            emphasis="strong"
            value={
              <NumericValue
                value={c.total_pnl_usd}
                kind="usd"
                color="auto"
                sign="always"
              />
            }
          />
          <MetricCell
            label="Return"
            emphasis="strong"
            value={
              <NumericValue
                value={(c.portfolio_return_pct ?? 0) / 100}
                kind="pct"
                color="auto"
                sign="always"
                decimals={1}
              />
            }
          />
          <MetricCell
            label="CAGR"
            emphasis="strong"
            value={
              <NumericValue
                value={(c.cagr_pct ?? 0) / 100}
                kind="pct"
                color="auto"
                sign="always"
                decimals={2}
              />
            }
          />
          <MetricCell
            label="Max Drawdown"
            emphasis="strong"
            value={
              <NumericValue
                value={(c.max_drawdown_pct ?? 0) / 100}
                kind="pct"
                decimals={2}
              />
            }
            footnote={
              c.max_drawdown_usd != null
                ? `$${c.max_drawdown_usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                : undefined
            }
          />
          <MetricCell
            label="Expectancy"
            emphasis="strong"
            value={
              <NumericValue
                value={c.expectancy_usd ?? 0}
                kind="usd"
                color="auto"
                sign="always"
              />
            }
            footnote="per trade"
          />
        </div>
      </HairlineCard>

      <HairlineCard>
        <div className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-muted)] font-medium mb-4">
          Risk-Adjusted Ratios
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
          <MetricCell
            label="Sharpe"
            emphasis="strong"
            value={<NumericValue value={c.sharpe ?? 0} kind="ratio" decimals={3} />}
          />
          <MetricCell
            label="Sortino"
            emphasis="strong"
            value={<NumericValue value={c.sortino ?? 0} kind="ratio" decimals={3} />}
          />
          <MetricCell
            label="Calmar"
            emphasis="strong"
            value={<NumericValue value={c.calmar ?? 0} kind="ratio" decimals={3} />}
          />
          <MetricCell
            label="Profit Factor"
            emphasis="strong"
            value={
              <NumericValue
                value={c.profit_factor ?? 0}
                kind="ratio"
                decimals={2}
              />
            }
          />
          <MetricCell
            label="Win Rate"
            emphasis="strong"
            value={
              <NumericValue
                value={c.win_rate_pct / 100}
                kind="pct"
                decimals={1}
              />
            }
            footnote={`${c.wins}W / ${c.losses}L`}
          />
          <MetricCell
            label="Avg Bars Held"
            emphasis="strong"
            value={
              <NumericValue
                value={c.avg_bars_held ?? 0}
                kind="ratio"
                decimals={1}
              />
            }
            footnote={`${c.total_trades} trades`}
          />
        </div>
      </HairlineCard>
    </div>
  );
}
