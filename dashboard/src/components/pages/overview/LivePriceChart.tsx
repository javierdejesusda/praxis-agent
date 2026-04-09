"use client";

import { useEffect, useMemo, useState } from "react";
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
import { usePrices, useQuote, useTrades } from "@/lib/hooks";
import { fmtUsd, fmtRelative } from "@/lib/format";
import { colors } from "@/lib/tokens";
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

function classifySide(side: string | undefined): TradeMarker["kind"] | null {
  if (!side) return null;
  const s = side.toLowerCase();
  if (s.startsWith("close_")) return "close";
  if (s === "long" || s === "short" || s === "buy" || s === "sell") return "open";
  return null;
}

function toneFor(side: string, kind: TradeMarker["kind"]): TradeMarker["tone"] {
  if (kind === "close") return "muted";
  const s = side.toLowerCase();
  if (s === "long" || s === "buy") return "gain";
  if (s === "short" || s === "sell") return "loss";
  return "muted";
}

function markerColor(tone: TradeMarker["tone"]): string {
  if (tone === "gain") return colors.gain;
  if (tone === "loss") return colors.loss;
  return colors.muted;
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
    const head = side.toUpperCase().replace("CLOSE_", "×");
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
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function LivePriceChart({
  pair,
  display,
}: {
  pair: string;
  display?: string;
}) {
  const { data: series } = usePrices(pair, 60, 120);
  const { data: quote } = useQuote(pair);
  const { data: tradesData } = useTrades();

  const candles = useMemo(() => series?.candles ?? [], [series?.candles]);
  const source = series?.source;
  const trades = useMemo(() => tradesData ?? [], [tradesData]);
  const markers = useMemo(() => buildMarkers(trades, pair), [trades, pair]);
  const quotePrice = quote?.price;
  const quoteTsRaw = quote?.ts;
  const quoteError = quote?.error;
  const quoteFresh = quotePrice != null && !quoteError;

  // Force re-render every second so the relative "last tick" clock ticks
  // visibly even between the 3s quote polls.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Stitch the live quote into the chart as a synthetic "now" point so the
  // area extends to the right edge and visibly moves on every quote tick.
  // Without this, the chart only changes when a new 1h bar closes.
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

  const label = display ?? pair.replace("USD", "");
  const first = chartData[0]?.c;
  const lastBar = candles[candles.length - 1]?.c;
  const livePrice = quotePrice ?? lastBar;
  const lastChartPoint = chartData[chartData.length - 1];
  const change = first && livePrice ? (livePrice - first) / first : 0;
  const tone: PillTone = change > 0 ? "ok" : change < 0 ? "crit" : "neutral";
  const stroke = change >= 0 ? colors.gain : colors.loss;
  const fill = change >= 0 ? colors.gainSoft : colors.lossSoft;
  const lastTickLabel = quoteTsRaw ? fmtRelative(quoteTsRaw) : "—";

  return (
    <HairlineCard padded={false}>
      <div className="px-4 pt-3 pb-2 flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-ink)]">
            {label}USD
          </h3>
          <span className="num text-[20px] font-medium text-[color:var(--color-ink)] leading-none">
            {livePrice ? fmtUsd(livePrice, { decimals: 2 }) : "—"}
          </span>
          <StatusPill
            tone={tone}
            label={
              candles.length > 1
                ? `${change >= 0 ? "+" : ""}${(change * 100).toFixed(2)}%`
                : "—"
            }
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5">
            <span
              className={`inline-block w-1.5 h-1.5 ${quoteFresh ? "live-dot" : ""}`}
              style={{
                background: quoteFresh ? colors.gain : colors.muted,
                borderRadius: 1,
              }}
            />
            <span
              className="text-[9px] uppercase tracking-[0.12em]"
              style={{ color: quoteFresh ? colors.gain : colors.muted }}
            >
              {quoteFresh ? "LIVE" : "STALE"}
            </span>
          </span>
          <span className="text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-muted)]">
            {lastTickLabel} · 1h bars{source ? ` · ${source}` : ""}
          </span>
        </div>
      </div>
      <SectionHeader title="Price" count={markers.length || undefined} />
      <div className="px-2 pb-3" style={{ height: 220 }}>
        {candles.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-1 text-center px-4">
            <span className="text-[11px] text-[color:var(--color-muted)]">
              No price data yet.
            </span>
            <span className="text-[10px] text-[color:var(--color-muted-soft)]">
              {series?.error
                ? series.error
                : "Set FMP_API_KEY in .env and restart the backend."}
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 6, right: 12, bottom: 0, left: 0 }}
            >
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={formatClock}
                axisLine
                tickLine={false}
                tick={{ fontSize: 9 }}
                minTickGap={36}
              />
              <YAxis
                dataKey="c"
                domain={["auto", "auto"]}
                axisLine
                tickLine={false}
                tick={{ fontSize: 9 }}
                width={60}
                tickFormatter={(v: number) => fmtUsd(v, { decimals: 0 })}
              />
              <Tooltip
                contentStyle={{
                  background: colors.bone,
                  border: `1px solid ${colors.ruleStrong}`,
                  borderRadius: 2,
                  fontSize: 11,
                  color: colors.ink,
                  fontFamily: "var(--font-mono)",
                }}
                labelFormatter={(t) =>
                  new Date(Number(t) * 1000).toLocaleString()
                }
                formatter={(value) => [fmtUsd(Number(value)), "Close"]}
              />
              <Area
                type="linear"
                dataKey="c"
                stroke={stroke}
                strokeWidth={1.25}
                fill={fill}
                fillOpacity={0.45}
                isAnimationActive={false}
              />
              {quoteFresh && lastChartPoint && (
                <ReferenceDot
                  x={lastChartPoint.t}
                  y={lastChartPoint.c}
                  r={3}
                  fill={stroke}
                  stroke={colors.bone}
                  strokeWidth={1.5}
                />
              )}
              {markers.map((m) => {
                const color = markerColor(m.tone);
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
        <div className="px-4 pb-3 flex items-center gap-4 text-[9px] uppercase tracking-[0.1em] text-[color:var(--color-muted)]">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-[2px]"
              style={{ background: colors.gain }}
            />
            Long entry
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-[2px]"
              style={{ background: colors.loss }}
            />
            Short entry
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-[2px] border-t border-dashed"
              style={{ borderColor: colors.muted }}
            />
            Close
          </span>
        </div>
      )}
    </HairlineCard>
  );
}
