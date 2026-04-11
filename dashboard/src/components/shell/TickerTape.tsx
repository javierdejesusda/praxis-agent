"use client";

import { usePrism, useQuote } from "@/lib/hooks";
import { fmtUsd } from "@/lib/format";
import { CryptoIcon } from "@/components/ui/CryptoIcon";

function TickerItem({ symbol }: { symbol: string }) {
  const { data: quoteData } = useQuote(`${symbol}USD`);
  const { data: prismData } = usePrism(symbol);
  const sig = prismData?.signals?.data?.[0];
  const price = quoteData?.price ?? sig?.current_price ?? 0;
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
    <div className="flex items-center gap-2.5">
      <CryptoIcon symbol={symbol} size={20} />
      <span className="num text-[11px] uppercase tracking-wider text-[color:var(--color-muted)] font-medium">
        {symbol}
      </span>
      <span className="num text-[13px] font-semibold text-[color:var(--color-ink)]">
        {price > 0 ? fmtUsd(price, { decimals: 2 }) : "\u2014"}
      </span>
      <span className={`num text-[10px] font-medium ${color}`}>
        {sig?.overall_signal?.toUpperCase() ?? ""}
      </span>
    </div>
  );
}

export function TickerTape() {
  return (
    <div className="flex items-center gap-8 px-5 h-full border-l border-r border-[color:var(--color-rule)]">
      <TickerItem symbol="BTC" />
      <TickerItem symbol="ETH" />
    </div>
  );
}
