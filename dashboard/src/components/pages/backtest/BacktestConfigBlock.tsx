"use client";

import { KeyValueGrid } from "@/components/ui/KeyValueGrid";
import { NumericValue } from "@/components/ui/NumericValue";
import { SkeletonText } from "@/components/ui/Skeleton";
import { fmtTimestamp } from "@/lib/format";
import { useBacktestReport } from "@/lib/hooks";

export function BacktestConfigBlock() {
  const { data, isLoading } = useBacktestReport();

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-muted)] font-medium mb-3">
            Backtest Period
          </div>
          <SkeletonText
            lines={6}
            widths={["40%", "40%", "30%", "50%", "45%", "55%"]}
          />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const config = data.config;
  const recent = data.recent;

  const periodItems: Array<{ k: string; v: React.ReactNode }> = [];
  if (data.period_start) {
    periodItems.push({ k: "Period Start", v: data.period_start });
  }
  if (data.period_end) {
    periodItems.push({ k: "Period End", v: data.period_end });
  }
  if (data.mode) {
    periodItems.push({
      k: "Mode",
      v: <span className="uppercase tracking-[0.06em]">{data.mode}</span>,
    });
  }
  if (data.interval_minutes != null) {
    periodItems.push({ k: "Interval", v: `${data.interval_minutes} min (${data.interval_minutes / 60}h)` });
  }
  if (data.initial_equity != null) {
    periodItems.push({
      k: "Initial Equity",
      v: <NumericValue value={data.initial_equity} kind="usd" />,
    });
  }
  periodItems.push({
    k: "Generated At",
    v: fmtTimestamp(data.generated_at),
  });

  const configItems: Array<{ k: string; v: React.ReactNode }> = [];
  if (config) {
    if (config.min_signal_score_paper != null) {
      configItems.push({ k: "Min Score (Paper)", v: String(config.min_signal_score_paper) });
    }
    if (config.min_signal_score_erc != null) {
      configItems.push({ k: "Min Score (ERC)", v: String(config.min_signal_score_erc) });
    }
    if (config.min_signal_score_short != null) {
      configItems.push({ k: "Min Score (Short)", v: String(config.min_signal_score_short) });
    }
    if (config.shorts_enabled != null) {
      configItems.push({ k: "Shorts Enabled", v: config.shorts_enabled ? "YES" : "NO" });
    }
    if (config.stop_mult != null) {
      configItems.push({ k: "Stop Multiplier", v: `${config.stop_mult}x ATR` });
    }
    if (config.trail_mult != null) {
      configItems.push({ k: "Trail Multiplier", v: `${config.trail_mult}x ATR` });
    }
    if (config.target_mult_base != null) {
      configItems.push({ k: "Target Multiplier", v: `${config.target_mult_base}x ATR` });
    }
    if (config.macro_filter != null) {
      configItems.push({ k: "Macro Filter", v: config.macro_filter ? "ON" : "OFF" });
    }
    if (config.mtf_daily_filter != null) {
      configItems.push({ k: "MTF Daily Filter", v: config.mtf_daily_filter ? "ON" : "OFF" });
    }
    if (config.max_consecutive_losses != null) {
      configItems.push({ k: "Max Consecutive Losses", v: String(config.max_consecutive_losses) });
    }
    if (config.dd_scale_factor != null) {
      configItems.push({ k: "DD Scale Factor", v: String(config.dd_scale_factor) });
    }
  }

  const recentItems: Array<{ k: string; v: React.ReactNode }> = recent
    ? [
        { k: "Window Start", v: recent.window_start },
        {
          k: "Trades",
          v: <NumericValue value={recent.trades} kind="int" />,
        },
        {
          k: "Win Rate",
          v: (
            <NumericValue
              value={recent.win_rate_pct / 100}
              kind="pct"
              decimals={1}
            />
          ),
        },
        {
          k: "PnL",
          v: (
            <NumericValue value={recent.pnl_usd} kind="usd" color="auto" sign="always" />
          ),
        },
        {
          k: "Profit Factor",
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
    <div className="space-y-5">
      <div>
        <div className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-muted)] font-medium mb-3">
          Backtest Period
        </div>
        <KeyValueGrid items={periodItems} columns={3} />
      </div>

      {configItems.length > 0 && (
        <div>
          <div className="border-t border-[color:var(--color-rule)] pt-4" />
          <div className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-muted)] font-medium mb-3">
            Strategy Parameters
          </div>
          <KeyValueGrid items={configItems} columns={3} />
        </div>
      )}

      {recent && (
        <div>
          <div className="border-t border-[color:var(--color-rule)] pt-4" />
          <div className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-muted)] font-medium mb-3">
            Recent Performance (since {recent.window_start})
          </div>
          <KeyValueGrid items={recentItems} columns={3} />
        </div>
      )}
    </div>
  );
}
