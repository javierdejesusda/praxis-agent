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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={t.icon}
        alt=""
        width={16}
        height={16}
        loading="lazy"
        decoding="async"
        className="shrink-0"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
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

  const frame =
    "relative z-10 h-9 flex items-center border-b border-[color:var(--color-rule)] overflow-hidden";
  const frameStyle: React.CSSProperties = {
    background: "var(--color-surface)",
    backdropFilter: "saturate(180%) blur(20px)",
    WebkitBackdropFilter: "saturate(180%) blur(20px)",
  };

  if (!ready) {
    return (
      <div aria-hidden="true" className={frame} style={frameStyle}>
        <span className="px-5 text-[11px] uppercase tracking-[0.08em] text-[color:var(--color-muted)]">
          {isLoading ? "Loading markets\u2026" : "Markets unavailable"}
        </span>
      </div>
    );
  }

  return (
    <div aria-hidden="true" className={`group ${frame}`} style={frameStyle}>
      <div
        className="ticker-tape-scroll flex items-center whitespace-nowrap will-change-transform group-hover:[animation-play-state:paused]"
        style={{ width: "max-content" }}
      >
        {[0, 1].map((copy) => (
          <div
            key={copy}
            className="flex items-center gap-8 pr-8"
            aria-hidden={copy === 1}
          >
            {tickers.map((t) => (
              <TickerItem key={`${copy}-${t.symbol}`} t={t} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
