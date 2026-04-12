"use client";

import { usePrism, useRegime } from "@/lib/hooks";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { NumericValue } from "@/components/ui/NumericValue";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";
import { IndicatorCell, type IndicatorTone } from "./IndicatorCell";

function ScoreBar({
  label,
  score,
  max = 4,
  variant,
}: {
  label: string;
  score: number;
  max?: number;
  variant: "gain" | "loss";
}) {
  const pct = Math.max(0, Math.min(100, (score / max) * 100));
  const bg =
    variant === "gain" ? "var(--color-gain)" : "var(--color-loss)";
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-muted)] w-10 font-medium">
        {label}
      </span>
      <div className="flex-1 h-2 bg-[color:var(--color-paper)] border border-[color:var(--color-rule)] rounded-full">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: bg }}
        />
      </div>
      <span className="num text-[11px] text-[color:var(--color-ink)] w-6 text-right font-medium">
        {score}
      </span>
    </div>
  );
}

function rsiTone(rsi: number | undefined): IndicatorTone {
  if (rsi == null || !Number.isFinite(rsi)) return "neutral";
  if (rsi >= 55) return "bullish";
  if (rsi <= 45) return "bearish";
  return "neutral";
}

function adxTone(adx: number | undefined): IndicatorTone {
  if (adx == null || !Number.isFinite(adx) || adx <= 0) return "neutral";
  if (adx >= 25) return "bullish";
  if (adx < 20) return "bearish";
  return "neutral";
}

function regimeTone(regime: string | undefined): IndicatorTone {
  const r = (regime || "").toLowerCase();
  if (r === "trending" || r === "momentum" || r === "trend") return "bullish";
  if (r === "ranging" || r === "mean_reversion" || r === "mean-reversion")
    return "bearish";
  return "neutral";
}

function volTone(daily: number | undefined): IndicatorTone {
  if (daily == null || !Number.isFinite(daily) || daily <= 0) return "neutral";
  if (daily >= 0.04) return "bearish";
  if (daily <= 0.02) return "bullish";
  return "neutral";
}

function regimeLabel(regime: string | undefined): string {
  const r = (regime || "").toLowerCase();
  if (!r || r === "unknown") return "—";
  if (r === "trending" || r === "momentum" || r === "trend") return "TREND";
  if (r === "ranging" || r === "mean_reversion" || r === "mean-reversion")
    return "RANGE";
  return r.slice(0, 6).toUpperCase();
}

function PrismCard({ symbol }: { symbol: string }) {
  const { data: prism, isLoading } = usePrism(symbol);
  const { data: regime } = useRegime();

  if (isLoading) {
    return (
      <HairlineCard>
        <SectionHeader
          title={symbol}
          rightSlot={<Skeleton width={60} height={18} radius={9} />}
        />
        <div className="space-y-5">
          <Skeleton width={140} height={28} />
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <Skeleton width={40} height={10} />
              <Skeleton width="100%" height={8} radius={9999} />
              <Skeleton width={24} height={11} />
            </div>
            <div className="flex items-center gap-2.5">
              <Skeleton width={40} height={10} />
              <Skeleton width="100%" height={8} radius={9999} />
              <Skeleton width={24} height={11} />
            </div>
          </div>
          <SkeletonText
            lines={6}
            widths={["45%", "50%", "55%", "40%", "48%", "52%"]}
          />
        </div>
      </HairlineCard>
    );
  }

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
        <div className="space-y-5">
          <div className="num text-[24px] font-semibold text-[color:var(--color-ink)] tracking-[-0.02em]">
            <NumericValue value={sig.current_price} kind="usd" />
          </div>
          <div className="space-y-2">
            <ScoreBar label="Bull" score={sig.bullish_score} variant="gain" />
            <ScoreBar label="Bear" score={sig.bearish_score} variant="loss" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <IndicatorCell
              label="Regime"
              value={null}
              badgeText={regimeLabel(regime?.regime)}
              tone={regimeTone(regime?.regime)}
            />
            <IndicatorCell
              label="ADX 14"
              value={regime?.adx}
              kind="ratio"
              decimals={1}
              tone={adxTone(regime?.adx)}
            />
            <IndicatorCell
              label="RSI 14"
              value={sig.indicators?.rsi}
              kind="ratio"
              decimals={1}
              tone={rsiTone(sig.indicators?.rsi)}
            />
            <IndicatorCell
              label="Spread bps"
              value={sig.indicators?.spread_bps}
              kind="bps"
              tone="neutral"
            />
            <IndicatorCell
              label="Daily Vol"
              value={risk?.daily_volatility}
              kind="ratio"
              decimals={3}
              tone={volTone(risk?.daily_volatility)}
            />
            <IndicatorCell
              label="Cost bps"
              value={sig.indicators?.cost_bps}
              kind="bps"
              tone="neutral"
            />
          </div>
        </div>
      )}
    </HairlineCard>
  );
}

export function PrismRow() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <PrismCard symbol="BTC" />
      <PrismCard symbol="ETH" />
    </div>
  );
}
