"use client";

import { memo, useMemo } from "react";
import {
  Area,
  ComposedChart,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useBacktestReport, usePortfolio, useTrades } from "@/lib/hooks";
import type { Artifact } from "@/lib/api";
import { fmtUsd } from "@/lib/format";

type Point = {
  t: number;
  equity: number;
  peak: number;
  buyHold?: number;
};

type Marker = {
  t: number;
  equity: number;
  side: "buy" | "sell";
};

function deriveSeries(
  portfolio: ReturnType<typeof usePortfolio>["data"],
  trades: Artifact[] | undefined,
  buyHoldReturnPct: number | undefined,
): { series: Point[]; markers: Marker[]; positive: boolean } {
  const equity = portfolio?.equity ?? 10000;
  const peakEquity = portfolio?.peak_equity ?? equity;
  const totalPnl = portfolio?.total_pnl ?? 0;
  const isPositive = totalPnl >= 0;

  const filled = (trades ?? [])
    .filter((a) => {
      const r = a.payload?.receipt;
      return r?.status === "filled" && typeof r.fill_price === "number";
    })
    .slice()
    .sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      return ta - tb;
    });

  const baseEquity = equity - totalPnl;
  const points: Point[] = [{ t: 0, equity: baseEquity, peak: baseEquity }];
  const markers: Marker[] = [];

  let running = baseEquity;
  let peak = baseEquity;
  let openSide: "long" | "short" | null = null;
  let openFill = 0;
  let openSize = 0;
  let step = 1;

  for (const trade of filled) {
    const intent = trade.payload?.intent;
    const receipt = trade.payload?.receipt;
    if (!intent || !receipt) continue;
    const side = (intent.side || "").toLowerCase();
    const fill = receipt.fill_price ?? 0;
    const size = intent.size_usd ?? 0;
    if (!fill || !size) continue;

    const markerSide: "buy" | "sell" =
      side === "long" || side === "buy" ? "buy" : "sell";

    if (openSide && side !== openSide) {
      const direction = openSide === "long" ? 1 : -1;
      const pnl = ((fill - openFill) / openFill) * openSize * direction;
      running += pnl;
      if (running > peak) peak = running;
      points.push({ t: step, equity: running, peak });
      markers.push({ t: step, equity: running, side: markerSide });
      step += 1;
      openSide = null;
      openFill = 0;
      openSize = 0;
    } else if (!openSide) {
      openSide = side === "long" ? "long" : "short";
      openFill = fill;
      openSize = size;
      markers.push({ t: step - 1, equity: running, side: markerSide });
    }
  }

  const hasComputed = points.length > 1;
  const finalSeries: Point[] = hasComputed
    ? [...points, { t: step, equity, peak: Math.max(peak, equity) }]
    : [
        { t: 0, equity: peakEquity, peak: peakEquity },
        { t: 1, equity, peak: Math.max(peakEquity, equity) },
      ];

  if (typeof buyHoldReturnPct === "number" && finalSeries.length >= 2) {
    const bhFinal = baseEquity * (1 + buyHoldReturnPct / 100);
    const n = finalSeries.length;
    for (let i = 0; i < n; i += 1) {
      const frac = n === 1 ? 1 : i / (n - 1);
      finalSeries[i].buyHold = baseEquity + (bhFinal - baseEquity) * frac;
    }
  }

  return { series: finalSeries, markers, positive: isPositive };
}

function EquityAreaChartImpl() {
  const { data: portfolio } = usePortfolio();
  const { data: trades } = useTrades();
  const { data: backtest } = useBacktestReport();

  const tradesKey = useMemo(() => {
    const arr = trades ?? [];
    const first = arr[0]?.timestamp ?? "";
    const last = arr[arr.length - 1]?.timestamp ?? "";
    return `${arr.length}|${first}|${last}`;
  }, [trades]);

  const buyHoldPct = backtest?.combined?.buy_hold_return_pct;

  const equitySnapshot = portfolio?.equity;
  const peakSnapshot = portfolio?.peak_equity;
  const totalPnlSnapshot = portfolio?.total_pnl;

  const { series, markers, positive } = useMemo(
    () => deriveSeries(portfolio, trades, buyHoldPct),
    // portfolio and trades are referenced via stable scalar snapshots and
    // tradesKey; recomputing on reference identity would thrash the chart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [equitySnapshot, peakSnapshot, totalPnlSnapshot, tradesKey, buyHoldPct],
  );

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={series}
          margin={{ top: 8, right: 8, bottom: 4, left: 4 }}
        >
          <defs>
            <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={
                  positive ? "var(--color-gain)" : "var(--color-loss)"
                }
                stopOpacity={0.35}
              />
              <stop
                offset="100%"
                stopColor={
                  positive ? "var(--color-gain)" : "var(--color-loss)"
                }
                stopOpacity={0.02}
              />
            </linearGradient>
            <linearGradient id="drawdownFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-loss)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--color-loss)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="t"
            axisLine
            tickLine={false}
            tick={{ fontSize: 10, fill: "var(--color-muted)" }}
            interval="preserveStartEnd"
            stroke="var(--color-rule-strong)"
          />
          <YAxis
            domain={["dataMin", "dataMax"]}
            axisLine
            tickLine={false}
            tick={{ fontSize: 10, fill: "var(--color-muted)" }}
            width={56}
            stroke="var(--color-rule-strong)"
            tickFormatter={(v: number) => fmtUsd(v, { decimals: 0 })}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-surface-solid)",
              border: "1px solid var(--color-rule-strong)",
              borderRadius: 12,
              fontSize: 12,
              color: "var(--color-ink)",
              fontFamily: "var(--font-mono)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
            }}
            labelStyle={{ color: "var(--color-muted)" }}
            itemStyle={{ color: "var(--color-ink)" }}
            formatter={(value, name) => {
              const n = Number(value);
              const label = String(name);
              if (!Number.isFinite(n)) return [String(value), label];
              if (label === "equity") return [fmtUsd(n), "Equity"];
              if (label === "peak") return [fmtUsd(n), "Peak"];
              if (label === "buyHold") return [fmtUsd(n), "BTC Hold"];
              return [fmtUsd(n), label];
            }}
            labelFormatter={(label) => `Step ${String(label)}`}
          />
          <Area
            type="monotone"
            dataKey="peak"
            stroke="none"
            fill="url(#drawdownFill)"
            fillOpacity={1}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="equity"
            stroke={positive ? "var(--color-gain)" : "var(--color-loss)"}
            strokeWidth={1.75}
            fill="url(#equityFill)"
            fillOpacity={1}
            isAnimationActive={false}
          />
          {typeof buyHoldPct === "number" && (
            <Line
              type="monotone"
              dataKey="buyHold"
              stroke="var(--color-accent)"
              strokeWidth={1.25}
              strokeDasharray="3 3"
              dot={false}
              isAnimationActive={false}
            />
          )}
          {markers.map((m, i) => (
            <ReferenceDot
              key={`mk-${i}-${m.t}-${m.side}`}
              x={m.t}
              y={m.equity}
              r={3}
              fill={
                m.side === "buy" ? "var(--color-gain)" : "var(--color-loss)"
              }
              stroke="var(--color-surface-solid)"
              strokeWidth={1}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export const EquityAreaChart = memo(EquityAreaChartImpl);
