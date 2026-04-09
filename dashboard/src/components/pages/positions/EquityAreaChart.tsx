"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { usePortfolio, useTrades } from "@/lib/hooks";
import { colors } from "@/lib/tokens";
import { fmtUsd } from "@/lib/format";

type Point = { t: number; equity: number };

export function EquityAreaChart() {
  const { data: portfolio } = usePortfolio();
  const { data: trades } = useTrades();

  const { series, positive } = useMemo(() => {
    const equity = portfolio?.equity ?? 10000;
    const peak = portfolio?.peak_equity ?? equity;
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
    const points: Point[] = [{ t: 0, equity: baseEquity }];

    let running = baseEquity;
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

      if (openSide && side !== openSide) {
        const direction = openSide === "long" ? 1 : -1;
        const pnl = ((fill - openFill) / openFill) * openSize * direction;
        running += pnl;
        points.push({ t: step++, equity: running });
        openSide = null;
        openFill = 0;
        openSize = 0;
      } else if (!openSide) {
        openSide = side === "long" ? "long" : "short";
        openFill = fill;
        openSize = size;
      }
    }

    const hasComputed = points.length > 1;
    const finalSeries: Point[] = hasComputed
      ? [...points, { t: step, equity }]
      : [
          { t: 0, equity: peak },
          { t: 1, equity },
        ];

    return { series: finalSeries, positive: isPositive };
  }, [portfolio, trades]);

  const stroke = positive ? colors.gain : colors.loss;
  const fill = positive ? colors.gainSoft : colors.lossSoft;

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
          <XAxis
            dataKey="t"
            axisLine
            tickLine={false}
            tick={{ fontSize: 10 }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={["dataMin", "dataMax"]}
            axisLine
            tickLine={false}
            tick={{ fontSize: 10 }}
            width={56}
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
            formatter={(value) => [fmtUsd(Number(value)), "Equity"]}
            labelFormatter={(label) => `Step ${String(label)}`}
          />
          <Area
            type="linear"
            dataKey="equity"
            stroke={stroke}
            strokeWidth={1.5}
            fill={fill}
            fillOpacity={0.5}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
