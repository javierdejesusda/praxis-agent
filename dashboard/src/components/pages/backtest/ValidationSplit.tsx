"use client";

import { HairlineCard } from "@/components/ui/HairlineCard";
import { NumericValue } from "@/components/ui/NumericValue";
import { StatusPill } from "@/components/ui/StatusPill";
import { useBacktestReport } from "@/lib/hooks";

function MetricRow({
  label,
  isVal,
  oosVal,
  kind,
  decimals,
  sign,
  color,
}: {
  label: string;
  isVal: number | undefined | null;
  oosVal: number | undefined | null;
  kind: "usd" | "pct" | "ratio" | "int";
  decimals?: number;
  sign?: "auto" | "always" | "never";
  color?: "auto" | "none";
}) {
  return (
    <tr>
      <td className="py-2 pr-4 text-[12px] text-[color:var(--color-muted)] font-medium">
        {label}
      </td>
      <td className="py-2 px-4 num text-right">
        <NumericValue value={isVal ?? 0} kind={kind} decimals={decimals} sign={sign} color={color} />
      </td>
      <td className="py-2 pl-4 num text-right">
        <NumericValue value={oosVal ?? 0} kind={kind} decimals={decimals} sign={sign} color={color} />
      </td>
    </tr>
  );
}

export function ValidationSplit() {
  const { data } = useBacktestReport();
  const is = data?.in_sample;
  const oos = data?.out_of_sample;

  if (!is && !oos) return null;

  const oosSharpeDegraded = oos?.sharpe != null && is?.sharpe != null && oos.sharpe < is.sharpe * 0.5;
  const oosProfitable = (oos?.total_pnl_usd ?? 0) > 0;

  return (
    <HairlineCard>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[15px] font-semibold text-[color:var(--color-ink)] tracking-[-0.02em]">
            In-Sample vs Out-of-Sample Validation
          </div>
          <div className="text-[12px] text-[color:var(--color-muted)] mt-0.5">
            OOS split at {data?.oos_split ?? "2023-01-01"} — parameters were optimized on IS data only
          </div>
        </div>
        <StatusPill
          tone={oosProfitable ? "ok" : oosSharpeDegraded ? "crit" : "warn"}
          label={oosProfitable ? "OOS POSITIVE" : oosSharpeDegraded ? "OOS DEGRADED" : "OOS FLAT"}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[color:var(--color-rule-strong)]">
              <th className="py-2 pr-4 text-left text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-muted)] font-medium">
                Metric
              </th>
              <th className="py-2 px-4 text-right text-[10px] uppercase tracking-[0.08em] font-medium" style={{ color: "#2979FF" }}>
                In-Sample
                <div className="text-[9px] font-normal text-[color:var(--color-muted)] normal-case tracking-normal mt-0.5">
                  {is?.period_start?.toString().slice(0, 10)} → {is?.period_end?.toString().slice(0, 10)}
                </div>
              </th>
              <th className="py-2 pl-4 text-right text-[10px] uppercase tracking-[0.08em] font-medium" style={{ color: "#FF9100" }}>
                Out-of-Sample
                <div className="text-[9px] font-normal text-[color:var(--color-muted)] normal-case tracking-normal mt-0.5">
                  {oos?.period_start?.toString().slice(0, 10)} → {oos?.period_end?.toString().slice(0, 10)}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <MetricRow label="Return" isVal={(is?.portfolio_return_pct ?? 0) / 100} oosVal={(oos?.portfolio_return_pct ?? 0) / 100} kind="pct" decimals={2} sign="always" color="auto" />
            <MetricRow label="Sharpe" isVal={is?.sharpe} oosVal={oos?.sharpe} kind="ratio" decimals={3} />
            <MetricRow label="Sortino" isVal={is?.sortino} oosVal={oos?.sortino} kind="ratio" decimals={3} />
            <MetricRow label="Calmar" isVal={is?.calmar} oosVal={oos?.calmar} kind="ratio" decimals={3} />
            <MetricRow label="Max Drawdown" isVal={(is?.max_drawdown_pct ?? 0) / 100} oosVal={(oos?.max_drawdown_pct ?? 0) / 100} kind="pct" decimals={2} />
            <MetricRow label="Trades" isVal={is?.total_trades} oosVal={oos?.total_trades} kind="int" />
            <MetricRow label="Win Rate" isVal={(is?.win_rate_pct ?? 0) / 100} oosVal={(oos?.win_rate_pct ?? 0) / 100} kind="pct" decimals={1} />
            <MetricRow label="Profit Factor" isVal={is?.profit_factor} oosVal={oos?.profit_factor} kind="ratio" decimals={2} />
            <MetricRow label="Expectancy" isVal={is?.expectancy_usd} oosVal={oos?.expectancy_usd} kind="usd" sign="always" color="auto" />
            <MetricRow label="Final Equity" isVal={is?.final_equity} oosVal={oos?.final_equity} kind="usd" />
          </tbody>
        </table>
      </div>
    </HairlineCard>
  );
}
