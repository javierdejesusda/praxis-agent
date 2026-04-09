"use client";

import { usePrism } from "@/lib/hooks";
import { fmtUsd } from "@/lib/format";

function TickerItem({ symbol }: { symbol: string }) {
  const { data } = usePrism(symbol);
  const sig = data?.signals?.data?.[0];
  const price = sig?.current_price ?? 0;
  const bull = sig?.bullish_score ?? 0;
  const bear = sig?.bearish_score ?? 0;
  const bias = bull - bear;
  const color =
    bias > 0
      ? "text-[color:var(--color-gain)]"
      : bias < 0
      ? "text-[color:var(--color-loss)]"
      : "text-[color:var(--color-muted)]";
  return (
    <div className="flex items-baseline gap-2">
      <span className="num text-[10px] uppercase tracking-wider text-[color:var(--color-muted)]">
        {symbol}
      </span>
      <span className="num text-[12px] text-[color:var(--color-ink)]">
        {price > 0 ? fmtUsd(price, { decimals: 2 }) : "—"}
      </span>
      <span className={`num text-[10px] ${color}`}>
        {sig?.overall_signal?.toUpperCase() ?? ""}
      </span>
    </div>
  );
}

export function TickerTape() {
  return (
    <div className="flex items-center gap-6 px-4 h-full border-l border-r border-[color:var(--color-rule)]">
      <TickerItem symbol="BTC" />
      <TickerItem symbol="ETH" />
    </div>
  );
}
