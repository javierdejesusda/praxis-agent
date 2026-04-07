"use client";

import { motion } from "framer-motion";
import { Zap, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { PrismData } from "@/lib/api";

interface Props {
  btc: PrismData | undefined;
  eth: PrismData | undefined;
}

function SignalBadge({ direction, strength }: { direction: string; strength: string }) {
  const isBull = direction === "bullish";
  const isBear = direction === "bearish";

  return (
    <div className="flex items-center gap-1.5">
      {isBull ? (
        <TrendingUp size={14} className="text-emerald-400" />
      ) : isBear ? (
        <TrendingDown size={14} className="text-rose-400" />
      ) : (
        <Minus size={14} className="text-slate-500" />
      )}
      <span
        className={`text-[10px] font-bold tracking-wider ${
          isBull ? "text-emerald-400" : isBear ? "text-rose-400" : "text-slate-500"
        }`}
      >
        {direction.toUpperCase()}
      </span>
      <span className="text-[9px] text-slate-500">{strength}</span>
    </div>
  );
}

function AssetRow({ data }: { data: PrismData }) {
  const signal = data.signals?.data?.[0];
  const risk = data.risk;

  return (
    <div className="p-3 rounded-lg bg-white/[0.02] space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-300">{data.symbol}</span>
        {signal ? (
          <SignalBadge direction={signal.direction} strength={signal.strength} />
        ) : (
          <span className="text-[10px] text-slate-600">No signal</span>
        )}
      </div>

      {signal && (
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div>
            <span className="text-slate-500">Price</span>
            <p className="text-slate-300 font-mono">
              ${signal.current_price?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
          <div>
            <span className="text-slate-500">Bull/Bear</span>
            <p className="text-slate-300">
              {signal.bullish_score} / {signal.bearish_score}
            </p>
          </div>
          {signal.indicators?.rsi != null && (
            <div>
              <span className="text-slate-500">RSI</span>
              <p className="text-slate-300">{signal.indicators.rsi.toFixed(1)}</p>
            </div>
          )}
        </div>
      )}

      {risk && (
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div>
            <span className="text-slate-500">Vol (ann.)</span>
            <p className="text-slate-300">{risk.annual_volatility?.toFixed(1)}%</p>
          </div>
          <div>
            <span className="text-slate-500">Max DD</span>
            <p className="text-slate-300">{risk.max_drawdown?.toFixed(1)}%</p>
          </div>
          <div>
            <span className="text-slate-500">Sharpe</span>
            <p className="text-slate-300">{risk.sharpe_ratio?.toFixed(2)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function PrismPanel({ btc, eth }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.65 }}
      className="glass noise-overlay relative overflow-hidden p-6"
    >
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold tracking-[0.25em] uppercase text-slate-400 font-[family-name:var(--font-display)]">
            PRISM Intelligence
          </h2>
          <Zap size={14} className="text-amber-400/50" />
        </div>

        <div className="space-y-2">
          {btc && <AssetRow data={btc} />}
          {eth && <AssetRow data={eth} />}
          {!btc && !eth && (
            <p className="text-xs text-slate-600 text-center py-4">
              PRISM API not connected
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
