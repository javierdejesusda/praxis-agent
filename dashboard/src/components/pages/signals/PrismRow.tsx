"use client";

import { usePrism } from "@/lib/hooks";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { NumericValue } from "@/components/ui/NumericValue";
import { KeyValueGrid } from "@/components/ui/KeyValueGrid";
import { EmptyState } from "@/components/ui/EmptyState";
import { colors } from "@/lib/tokens";

function ScoreBar({
  label,
  score,
  max = 4,
  color,
}: {
  label: string;
  score: number;
  max?: number;
  color: string;
}) {
  const pct = Math.max(0, Math.min(100, (score / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-muted)] w-10">
        {label}
      </span>
      <div
        className="flex-1 h-1.5 bg-[color:var(--color-paper)] border border-[color:var(--color-rule)]"
        style={{ borderRadius: 1 }}
      >
        <div
          className="h-full"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="num text-[11px] text-[color:var(--color-ink)] w-6 text-right">
        {score}
      </span>
    </div>
  );
}

function PrismCard({ symbol }: { symbol: string }) {
  const { data: prism } = usePrism(symbol);
  const sig = prism?.signals?.data?.[0];
  const risk = prism?.risk;

  return (
    <HairlineCard>
      <SectionHeader
        title={symbol}
        rightSlot={
          sig?.overall_signal ? (
            <StatusPill
              tone="neutral"
              label={sig.overall_signal.toUpperCase()}
            />
          ) : undefined
        }
      />
      {!sig ? (
        <EmptyState label={`No Prism data for ${symbol}.`} />
      ) : (
        <div className="space-y-4">
          <div className="num text-[22px] text-[color:var(--color-ink)]">
            <NumericValue value={sig.current_price} kind="usd" />
          </div>
          <div className="space-y-1.5">
            <ScoreBar label="Bull" score={sig.bullish_score} color={colors.gain} />
            <ScoreBar label="Bear" score={sig.bearish_score} color={colors.loss} />
          </div>
          <KeyValueGrid
            items={[
              {
                k: "RSI",
                v: (
                  <NumericValue
                    value={sig.indicators?.rsi ?? 0}
                    kind="ratio"
                    decimals={2}
                  />
                ),
              },
              {
                k: "MACD",
                v: (
                  <NumericValue
                    value={sig.indicators?.macd ?? 0}
                    kind="ratio"
                    decimals={2}
                  />
                ),
              },
              {
                k: "MACD Hist",
                v: (
                  <NumericValue
                    value={sig.indicators?.macd_hist ?? 0}
                    kind="ratio"
                    decimals={2}
                  />
                ),
              },
              {
                k: "BB Upper",
                v: (
                  <NumericValue
                    value={sig.indicators?.bb_upper ?? 0}
                    kind="ratio"
                    decimals={2}
                  />
                ),
              },
              {
                k: "BB Lower",
                v: (
                  <NumericValue
                    value={sig.indicators?.bb_lower ?? 0}
                    kind="ratio"
                    decimals={2}
                  />
                ),
              },
              {
                k: "Daily Vol",
                v: (
                  <NumericValue
                    value={risk?.daily_volatility ?? 0}
                    kind="ratio"
                    decimals={2}
                  />
                ),
              },
              {
                k: "Annual Vol",
                v: (
                  <NumericValue
                    value={risk?.annual_volatility ?? 0}
                    kind="ratio"
                    decimals={2}
                  />
                ),
              },
              {
                k: "Sharpe",
                v: (
                  <NumericValue
                    value={risk?.sharpe_ratio ?? 0}
                    kind="ratio"
                    decimals={2}
                  />
                ),
              },
              {
                k: "Current DD",
                v: (
                  <NumericValue
                    value={risk?.current_drawdown ?? 0}
                    kind="ratio"
                    decimals={2}
                  />
                ),
              },
              {
                k: "Max DD",
                v: (
                  <NumericValue
                    value={risk?.max_drawdown ?? 0}
                    kind="ratio"
                    decimals={2}
                  />
                ),
              },
              {
                k: "Positive Days %",
                v: (
                  <NumericValue
                    value={risk?.positive_days_pct ?? 0}
                    kind="ratio"
                    decimals={2}
                  />
                ),
              },
            ]}
          />
        </div>
      )}
    </HairlineCard>
  );
}

export function PrismRow() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <PrismCard symbol="BTC" />
      <PrismCard symbol="ETH" />
    </div>
  );
}
