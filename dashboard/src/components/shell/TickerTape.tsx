"use client";

import { ArrowDown, ArrowUp } from "lucide-react";

import { fmtTickerPrice, useMarketTickers, type MarketTicker } from "@/lib/market";

function TickerItem({ t }: { t: MarketTicker }) {
  const up = t.change24h > 0;
  const down = t.change24h < 0;
  const tone = up
    ? "text-[color:var(--color-gain)]"
    : down
      ? "text-[color:var(--color-loss)]"
      : "text-[color:var(--color-muted)]";
  return (
    <div className="flex items-center gap-2">
      <span className="num text-[11px] uppercase tracking-[0.08em] text-[color:var(--color-muted)] font-medium">
        {t.symbol}
      </span>
      <span className="num text-[12px] font-semibold text-[color:var(--color-ink)]">
        ${fmtTickerPrice(t.price)}
      </span>
      <span className={`num inline-flex items-center gap-0.5 text-[11px] font-semibold ${tone}`}>
        {up ? (
          <ArrowUp size={11} strokeWidth={2.75} />
        ) : down ? (
          <ArrowDown size={11} strokeWidth={2.75} />
        ) : null}
        {t.change24h >= 0 ? "+" : ""}
        {t.change24h.toFixed(2)}%
      </span>
    </div>
  );
}

export function TickerTape() {
  const { data, isLoading } = useMarketTickers();
  const ready = (data ?? []).some((t) => t.price > 0);
  const tickers = ready ? (data as MarketTicker[]) : [];

  if (!ready) {
    return (
      <div
        aria-hidden="true"
        className="flex-1 flex items-center px-5 border-l border-r border-[color:var(--color-rule)] overflow-hidden"
      >
        <span className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--color-muted)]">
          {isLoading ? "Loading markets…" : "Markets unavailable"}
        </span>
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className="group flex-1 flex items-center h-full border-l border-r border-[color:var(--color-rule)] overflow-hidden"
    >
      <div
        className="ticker-tape-scroll flex items-center whitespace-nowrap will-change-transform group-hover:[animation-play-state:paused]"
        style={{ width: "max-content" }}
      >
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center gap-8 pr-8" aria-hidden={copy === 1}>
            {tickers.map((t) => (
              <TickerItem key={`${copy}-${t.symbol}`} t={t} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
