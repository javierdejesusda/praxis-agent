"use client";

import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface Props {
  equity: number;
  pnl: number;
}

function generateEquityHistory(currentEquity: number): { time: string; equity: number }[] {
  const points = 24;
  const data: { time: string; equity: number }[] = [];
  const baseEquity = 10000;
  const delta = currentEquity - baseEquity;

  for (let i = 0; i < points; i++) {
    const progress = i / (points - 1);
    const noise = (Math.random() - 0.5) * 50;
    const equity = baseEquity + delta * progress + noise * (1 - progress * 0.5);
    const hour = String(i).padStart(2, "0");
    data.push({ time: `${hour}:00`, equity: Math.round(equity * 100) / 100 });
  }

  data[data.length - 1].equity = currentEquity;
  return data;
}

export function EquityChart({ equity, pnl }: Props) {
  const data = generateEquityHistory(equity);
  const isPositive = pnl >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="glass noise-overlay relative overflow-hidden p-6"
    >
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold tracking-[0.25em] uppercase text-slate-400 font-[family-name:var(--font-display)]">
            Equity Curve
          </h2>
          <div className="flex items-center gap-3">
            <span
              className={`text-xs font-bold ${
                isPositive ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {isPositive ? "+" : ""}${pnl.toFixed(2)}
            </span>
            <span className="text-[10px] text-slate-500">
              {isPositive ? "+" : ""}
              {((pnl / 10000) * 100).toFixed(2)}%
            </span>
          </div>
        </div>

        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={isPositive ? "#10B981" : "#F43F5E"}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="100%"
                    stopColor={isPositive ? "#10B981" : "#F43F5E"}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="time"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 9, fill: "#64748B" }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={["dataMin - 50", "dataMax + 50"]}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 9, fill: "#64748B" }}
                width={50}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(13, 20, 36, 0.9)",
                  border: "1px solid rgba(248, 250, 252, 0.1)",
                  borderRadius: 8,
                  fontSize: 11,
                  color: "#F8FAFC",
                }}
                formatter={(value) => [`$${Number(value).toFixed(2)}`, "Equity"]}
              />
              <Area
                type="monotone"
                dataKey="equity"
                stroke={isPositive ? "#10B981" : "#F43F5E"}
                strokeWidth={2}
                fill="url(#equityGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </motion.div>
  );
}
