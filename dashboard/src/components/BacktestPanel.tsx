"use client";

import { motion } from "framer-motion";
import { BarChart3, TrendingUp, AlertTriangle, Target } from "lucide-react";
import type { BacktestReport } from "@/lib/api";

interface Props {
  report: BacktestReport;
}

function fmtPct(n: number | undefined, sign = false): string {
  if (n == null || Number.isNaN(n)) return "—";
  const prefix = sign && n > 0 ? "+" : "";
  return `${prefix}${n.toFixed(2)}%`;
}

function fmtNumber(n: number | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(digits);
}

function fmtUsd(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const prefix = n >= 0 ? "+" : "";
  return `${prefix}$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function BacktestPanel({ report }: Props) {
  if (!report.available || !report.combined) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.45 }}
        className="glass noise-overlay relative overflow-hidden p-6"
      >
        <div className="relative z-10">
          <h2 className="text-xs font-semibold tracking-[0.25em] uppercase text-slate-400 mb-4 font-[family-name:var(--font-display)]">
            Backtest Proof
          </h2>
          <div className="text-[11px] text-slate-500 italic py-4 text-center">
            No backtest report available. Run scripts/final_report.py to generate one.
          </div>
        </div>
      </motion.div>
    );
  }

  const c = report.combined;
  const pairs = report.per_pair ?? [];
  const generatedAt = report.generated_at
    ? new Date(report.generated_at).toISOString().slice(0, 10)
    : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.45 }}
      className="glass noise-overlay relative overflow-hidden p-6"
    >
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xs font-semibold tracking-[0.25em] uppercase text-slate-400 font-[family-name:var(--font-display)]">
            Backtest Proof
          </h2>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <BarChart3 size={11} />
            {generatedAt}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="rounded-lg bg-emerald-400/8 border border-emerald-400/15 p-3">
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-slate-400 mb-1">
              <TrendingUp size={10} /> Profit Factor
            </div>
            <div className="text-xl font-bold text-emerald-400 font-[family-name:var(--font-display)]">
              {fmtNumber(c.profit_factor)}
            </div>
            <div className="text-[9px] text-slate-500 mt-0.5">
              {c.total_trades} trades · {c.win_rate_pct.toFixed(1)}% WR
            </div>
          </div>
          <div className="rounded-lg bg-cyan-400/8 border border-cyan-400/15 p-3">
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-slate-400 mb-1">
              <Target size={10} /> Calmar
            </div>
            <div className="text-xl font-bold text-cyan-400 font-[family-name:var(--font-display)]">
              {fmtNumber(c.calmar)}
            </div>
            <div className="text-[9px] text-slate-500 mt-0.5">
              return / drawdown
            </div>
          </div>
          <div className="rounded-lg bg-sky-400/8 border border-sky-400/15 p-3">
            <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-1">
              Portfolio Return
            </div>
            <div className="text-xl font-bold text-sky-400 font-[family-name:var(--font-display)]">
              {fmtPct(c.portfolio_return_pct, true)}
            </div>
            <div className="text-[9px] text-slate-500 mt-0.5">
              {fmtUsd(c.total_pnl_usd)} on $20k
            </div>
          </div>
          <div className="rounded-lg bg-rose-400/8 border border-rose-400/15 p-3">
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-slate-400 mb-1">
              <AlertTriangle size={10} /> Max Drawdown
            </div>
            <div className="text-xl font-bold text-rose-400 font-[family-name:var(--font-display)]">
              {fmtPct(c.max_drawdown_pct)}
            </div>
            <div className="text-[9px] text-slate-500 mt-0.5">
              under 8% kill gate
            </div>
          </div>
        </div>

        {pairs.length > 0 && (
          <div className="space-y-1.5">
            {pairs.map((p) => (
              <div
                key={p.pair}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02] border border-white/[0.04]"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-200">
                    {p.pair}
                  </span>
                  <span className="text-[9px] text-slate-500">
                    {p.trades} trades · {p.win_rate_pct.toFixed(1)}% WR
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="text-slate-400">
                    PF{" "}
                    <span className="text-emerald-400 font-semibold">
                      {fmtNumber(p.profit_factor)}
                    </span>
                  </span>
                  <span className="text-slate-400">
                    Sharpe{" "}
                    <span className="text-cyan-400 font-semibold">
                      {fmtNumber(p.sharpe)}
                    </span>
                  </span>
                  <span className="text-slate-400">
                    DD{" "}
                    <span className="text-rose-400 font-semibold">
                      {fmtPct(p.max_drawdown_pct)}
                    </span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {report.recent && (
          <div className="mt-3 pt-3 border-t border-white/[0.04]">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-500 uppercase tracking-wider">
                Recent · {report.recent.window_start.slice(0, 4)}–now
              </span>
              <div className="flex items-center gap-3">
                <span className="text-slate-400">
                  {report.recent.trades} trades
                </span>
                <span className="text-emerald-400 font-semibold">
                  PF {fmtNumber(report.recent.profit_factor)}
                </span>
                <span
                  className={
                    report.recent.pnl_usd >= 0
                      ? "text-emerald-400 font-semibold"
                      : "text-rose-400 font-semibold"
                  }
                >
                  {fmtUsd(report.recent.pnl_usd)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
