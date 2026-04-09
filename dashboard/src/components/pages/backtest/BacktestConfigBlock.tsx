"use client";

import { KeyValueGrid } from "@/components/ui/KeyValueGrid";
import { NumericValue } from "@/components/ui/NumericValue";
import { fmtTimestamp } from "@/lib/format";
import { useBacktestReport } from "@/lib/hooks";

export function BacktestConfigBlock() {
  const { data } = useBacktestReport();
  if (!data) return null;

  const config = data.config;
  const recent = data.recent;

  const configItems: Array<{ k: string; v: React.ReactNode }> = [];
  if (config) {
    configItems.push(
      { k: "Min Score (Paper)", v: String(config.min_signal_score_paper) },
      { k: "Min Score (Short)", v: String(config.min_signal_score_short) },
      { k: "Shorts Enabled", v: config.shorts_enabled ? "YES" : "NO" },
    );
  }
  configItems.push({
    k: "Generated At",
    v: fmtTimestamp(data.generated_at),
  });

  const recentItems: Array<{ k: string; v: React.ReactNode }> = recent
    ? [
        { k: "Recent Window Start", v: recent.window_start },
        {
          k: "Recent Trades",
          v: <NumericValue value={recent.trades} kind="int" />,
        },
        {
          k: "Recent Win %",
          v: (
            <NumericValue
              value={recent.win_rate_pct / 100}
              kind="pct"
              decimals={1}
            />
          ),
        },
        {
          k: "Recent PnL",
          v: (
            <NumericValue value={recent.pnl_usd} kind="usd" color="auto" />
          ),
        },
        {
          k: "Recent PF",
          v: (
            <NumericValue
              value={recent.profit_factor}
              kind="ratio"
              decimals={2}
            />
          ),
        },
      ]
    : [];

  return (
    <div className="space-y-4">
      <KeyValueGrid items={configItems} columns={2} />
      {recent && (
        <>
          <div className="border-t border-[color:var(--color-rule)]" />
          <KeyValueGrid items={recentItems} columns={2} />
        </>
      )}
    </div>
  );
}
