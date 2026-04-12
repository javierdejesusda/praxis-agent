"use client";

import { Sparkline } from "@/components/ui/Sparkline";
import { NumericValue, type NumericKind } from "@/components/ui/NumericValue";

export type IndicatorTone = "bullish" | "bearish" | "neutral";

export type IndicatorCellProps = {
  label: string;
  value: number | null | undefined;
  kind?: NumericKind;
  decimals?: number;
  tone: IndicatorTone;
  history?: number[];
  badgeText?: string;
};

function toneColor(tone: IndicatorTone): string {
  if (tone === "bullish") return "var(--color-gain)";
  if (tone === "bearish") return "var(--color-loss)";
  return "var(--color-muted)";
}

export function IndicatorCell({
  label,
  value,
  kind = "ratio",
  decimals = 2,
  tone,
  history,
  badgeText,
}: IndicatorCellProps) {
  const color = toneColor(tone);
  const hasHistory = Array.isArray(history) && history.length >= 2;
  const sparkTone =
    tone === "bullish" ? "gain" : tone === "bearish" ? "loss" : "neutral";

  return (
    <div
      className="flex flex-col gap-1.5 rounded-lg border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] px-3 py-2.5 transition-[border-color,transform] duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
      style={{ borderLeft: `2px solid ${color}` }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
            style={{ backgroundColor: color }}
          />
          {badgeText ? (
            <span
              className="num text-[13px] font-semibold tracking-tight text-[color:var(--color-ink)] truncate"
              title={badgeText}
            >
              {badgeText}
            </span>
          ) : (
            <NumericValue
              value={typeof value === "number" ? value : NaN}
              kind={kind}
              decimals={decimals}
              className="text-[13px] font-semibold tracking-tight text-[color:var(--color-ink)]"
            />
          )}
        </div>
        {hasHistory ? (
          <Sparkline
            data={history as number[]}
            width={44}
            height={14}
            tone={sparkTone}
            strokeWidth={1.25}
          />
        ) : null}
      </div>
      <span className="text-[9.5px] font-medium uppercase tracking-[0.1em] text-[color:var(--color-muted)]">
        {label}
      </span>
    </div>
  );
}
