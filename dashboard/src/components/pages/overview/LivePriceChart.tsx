"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { HairlineCard } from "@/components/ui/HairlineCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";
import { CryptoIcon } from "@/components/ui/CryptoIcon";
import { SkeletonChart } from "@/components/ui/Skeleton";
import { usePrices, useQuote, useTrades } from "@/lib/hooks";
import { fmtUsd, fmtRelative } from "@/lib/format";
import type { Artifact } from "@/lib/api";

type TradeMarker = {
  key: string;
  t: number;
  side: string;
  kind: "open" | "close";
  tone: "gain" | "loss" | "muted";
  label: string;
  price: number;
};

type ResolvedPalette = {
  ink: string;
  muted: string;
  gain: string;
  loss: string;
  gainSoft: string;
  lossSoft: string;
  surface: string;
  rule: string;
};

function readVar(el: HTMLElement, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

function usePalette(): ResolvedPalette | null {
  const [palette, setPalette] = useState<ResolvedPalette | null>(null);
  useEffect(() => {
    const read = () => {
      const el = document.documentElement;
      setPalette({
        ink: readVar(el, "--color-ink"),
        muted: readVar(el, "--color-muted"),
        gain: readVar(el, "--color-gain"),
        loss: readVar(el, "--color-loss"),
        gainSoft: readVar(el, "--color-gain-soft"),
        lossSoft: readVar(el, "--color-loss-soft"),
        surface: readVar(el, "--color-surface-solid"),
        rule: readVar(el, "--color-rule"),
      });
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    return () => mo.disconnect();
  }, []);
  return palette;
}

function classifySide(side: string | undefined): TradeMarker["kind"] | null {
  if (!side) return null;
  const s = side.toLowerCase();
  if (s.startsWith("close_")) return "close";
  if (s === "long" || s === "short" || s === "buy" || s === "sell")
    return "open";
  return null;
}

function toneFor(
  side: string,
  kind: TradeMarker["kind"],
): TradeMarker["tone"] {
  if (kind === "close") return "muted";
  const s = side.toLowerCase();
  if (s === "long" || s === "buy") return "gain";
  if (s === "short" || s === "sell") return "loss";
  return "muted";
}

function markerColor(
  tone: TradeMarker["tone"],
  palette: ResolvedPalette,
): string {
  if (tone === "gain") return palette.gain;
  if (tone === "loss") return palette.loss;
  return palette.muted;
}

function buildMarkers(trades: Artifact[], pair: string): TradeMarker[] {
  const markers: TradeMarker[] = [];
  for (const a of trades) {
    const p = a.payload ?? {};
    const artifactPair = p.pair || p.intent?.pair;
    if (artifactPair !== pair) continue;
    const side = p.intent?.side ?? p.risk_decision?.final_side ?? "";
    const kind = classifySide(side);
    if (!kind) continue;
    const ts = Date.parse(a.timestamp);
    if (Number.isNaN(ts)) continue;
    const price = p.receipt?.fill_price ?? 0;
    const tone = toneFor(side, kind);
    const head = side.toUpperCase().replace("CLOSE_", "\u00D7");
    markers.push({
      key: a.hash || `${a.timestamp}-${side}`,
      t: Math.floor(ts / 1000),
      side,
      kind,
      tone,
      label: `${head[0]} ${fmtUsd(price, { decimals: 0 })}`,
      price,
    });
  }
  return markers;
}

function formatClock(t: number): string {
  const d = new Date(t * 1000);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const LivePriceChart = React.memo(function LivePriceChart({
  pair,
  display,
}: {
  pair: string;
  display?: string;
}) {
  const { data: series, isLoading: pricesLoading } = usePrices(pair, 60, 120);
  const { data: quote } = useQuote(pair);
  const { data: tradesData } = useTrades();
  const palette = usePalette();

  const candles = useMemo(() => series?.candles ?? [], [series?.candles]);
  const source = series?.source;
  const trades = useMemo(() => tradesData ?? [], [tradesData]);
  const markers = useMemo(
    () => buildMarkers(trades, pair),
    [trades, pair],
  );
  const quotePrice = quote?.price;
  const quoteTsRaw = quote?.ts;
  const quoteError = quote?.error;
  const quoteFresh = quotePrice != null && !quoteError;

  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const chartData = useMemo(() => {
    if (candles.length === 0) return candles;
    if (!quoteFresh || quotePrice == null || !quoteTsRaw) return candles;
    const quoteTs = Math.floor(Date.parse(quoteTsRaw) / 1000);
    const lastTs = candles[candles.length - 1].t;
    if (!Number.isFinite(quoteTs) || quoteTs <= lastTs) return candles;
    return [
      ...candles,
      {
        t: quoteTs,
        o: quotePrice,
        h: quotePrice,
        l: quotePrice,
        c: quotePrice,
        v: 0,
      },
    ];
  }, [candles, quotePrice, quoteTsRaw, quoteFresh]);

  const base = display ?? pair.replace("USD", "");
  const label = `${base}/USD`;
  const first = chartData[0]?.c;
  const lastBar = candles[candles.length - 1]?.c;
  const livePrice = quotePrice ?? lastBar;
  const lastChartPoint = chartData[chartData.length - 1];
  const change = first && livePrice ? (livePrice - first) / first : 0;
  const tone: PillTone = change > 0 ? "ok" : change < 0 ? "crit" : "neutral";
  const stroke = palette
    ? change >= 0
      ? palette.gain
      : palette.loss
    : "";
  const fill = palette
    ? change >= 0
      ? palette.gainSoft
      : palette.lossSoft
    : "";
  const lastTickLabel = quoteTsRaw ? fmtRelative(quoteTsRaw) : "\u2014";

  const showSkeleton =
    palette == null || (pricesLoading && candles.length === 0);

  // When showSkeleton is false, palette is guaranteed resolved.
  const p = palette as ResolvedPalette;

  return (
    <HairlineCard padded={false}>
      <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CryptoIcon symbol={pair} size={24} />
          <h3 className="text-[14px] font-semibold uppercase tracking-[0.08em] text-[color:var(--color-ink)]">
            {label}
          </h3>
          <span className="num text-[22px] font-semibold text-[color:var(--color-ink)] leading-none tracking-[-0.02em]">
            {livePrice ? fmtUsd(livePrice, { decimals: 2 }) : "\u2014"}
          </span>
          <StatusPill
            tone={tone}
            label={
              candles.length > 1
                ? `${change >= 0 ? "+" : ""}${(change * 100).toFixed(2)}%`
                : "\u2014"
            }
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span
              className={`inline-block w-2 h-2 rounded-full ${quoteFresh ? "live-dot" : ""}`}
              style={{
                background: quoteFresh
                  ? "var(--color-gain)"
                  : "var(--color-muted)",
              }}
            />
            <span
              className="text-[9px] uppercase tracking-[0.12em] font-medium"
              style={{
                color: quoteFresh
                  ? "var(--color-gain)"
                  : "var(--color-muted)",
              }}
            >
              {quoteFresh ? "LIVE" : "STALE"}
            </span>
          </span>
          <span className="text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-muted)]">
            {lastTickLabel}
            {" \u00B7 "}1h bars{source ? ` \u00B7 ${source}` : ""}
          </span>
        </div>
      </div>
      <div className="px-5">
        <SectionHeader title="Price" count={markers.length || undefined} />
      </div>
      <div className="px-3 pb-4" style={{ height: 240 }}>
        {showSkeleton ? (
          <div className="h-full w-full px-2">
            <SkeletonChart height={224} />
          </div>
        ) : candles.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-1.5 text-center px-4">
            <span className="text-[12px] text-[color:var(--color-muted)]">
              No price data yet.
            </span>
            <span className="text-[11px] text-[color:var(--color-muted-soft)]">
              {series?.error
                ? series.error
                : "Set FMP_API_KEY in .env and restart the backend."}
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 8, right: 14, bottom: 0, left: 0 }}
            >
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={formatClock}
                axisLine
                tickLine={false}
                tick={{ fontSize: 10 }}
                minTickGap={36}
              />
              <YAxis
                dataKey="c"
                domain={["auto", "auto"]}
                axisLine
                tickLine={false}
                tick={{ fontSize: 10 }}
                width={64}
                tickFormatter={(v: number) => fmtUsd(v, { decimals: 0 })}
              />
              <Tooltip
                contentStyle={{
                  background: p.surface,
                  backdropFilter: "saturate(180%) blur(20px)",
                  WebkitBackdropFilter: "saturate(180%) blur(20px)",
                  border: `1px solid ${p.rule}`,
                  borderRadius: 12,
                  fontSize: 12,
                  color: p.ink,
                  fontFamily: "var(--font-mono)",
                  boxShadow: `0 4px 16px ${p.rule}`,
                }}
                labelFormatter={(t) =>
                  new Date(Number(t) * 1000).toLocaleString()
                }
                formatter={(value) => [fmtUsd(Number(value)), "Close"]}
              />
              <Area
                type="monotone"
                dataKey="c"
                stroke={stroke}
                strokeWidth={1.5}
                fill={fill}
                fillOpacity={0.5}
                isAnimationActive={false}
              />
              {quoteFresh && lastChartPoint && (
                <ReferenceDot
                  x={lastChartPoint.t}
                  y={lastChartPoint.c}
                  r={4}
                  fill={stroke}
                  stroke={p.surface}
                  strokeWidth={2}
                />
              )}
              {markers.map((m) => {
                const color = markerColor(m.tone, p);
                return (
                  <ReferenceLine
                    key={m.key}
                    x={m.t}
                    stroke={color}
                    strokeWidth={1}
                    strokeDasharray={m.kind === "close" ? "3 3" : undefined}
                    label={{
                      value: m.label,
                      position: "top",
                      fill: color,
                      fontSize: 9,
                      fontFamily: "var(--font-mono)",
                    }}
                  />
                );
              })}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      {markers.length > 0 && (
        <div className="px-5 pb-4 flex items-center gap-5 text-[9px] uppercase tracking-[0.1em] text-[color:var(--color-muted)] font-medium">
          <span className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-[2px] rounded-full"
              style={{ background: "var(--color-gain)" }}
            />
            Long entry
          </span>
          <span className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-[2px] rounded-full"
              style={{ background: "var(--color-loss)" }}
            />
            Short entry
          </span>
          <span className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-[2px] border-t border-dashed"
              style={{ borderColor: "var(--color-muted)" }}
            />
            Close
          </span>
        </div>
      )}
    </HairlineCard>
  );
});
