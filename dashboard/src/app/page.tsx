"use client";

import { motion } from "framer-motion";
import {
  Wallet,
  TrendingDown,
  BarChart3,
  Shield,
  Target,
} from "lucide-react";

import { StatCard } from "@/components/StatCard";
import { AgentPipeline } from "@/components/AgentPipeline";
import { KillCriteriaPanel } from "@/components/KillCriteriaPanel";
import { ArtifactLog } from "@/components/ArtifactLog";
import { EquityChart } from "@/components/EquityChart";
import { TradeHistory } from "@/components/TradeHistory";
import {
  usePortfolio,
  useStats,
  useKillCriteria,
  useArtifacts,
  useLatestSignals,
  useRegime,
  useTrades,
} from "@/lib/hooks";

export default function Dashboard() {
  const { data: portfolio } = usePortfolio();
  const { data: stats } = useStats();
  const { data: killCriteria } = useKillCriteria();
  const { data: artifacts } = useArtifacts();
  const { data: signalData } = useLatestSignals();
  const { data: regimeData } = useRegime();
  const { data: tradeList } = useTrades();

  if (!portfolio || !stats || !killCriteria) return null;

  const regimeLabel = regimeData?.regime?.toUpperCase() || "UNKNOWN";
  const regimeColor =
    regimeLabel === "TRENDING"
      ? "text-amber-400 bg-amber-400/10 border-amber-400/20"
      : regimeLabel === "RANGING"
      ? "text-sky-400 bg-sky-400/10 border-sky-400/20"
      : "text-slate-400 bg-slate-400/10 border-slate-400/20";

  const pnlPositive = portfolio.total_pnl >= 0;

  return (
    <div className="relative z-10 min-h-screen p-4 md:p-6 lg:p-8">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="flex items-center justify-between mb-8"
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400/20 to-violet-500/20 border border-amber-400/20 flex items-center justify-center">
            <Shield size={20} className="text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-wider font-[family-name:var(--font-display)] text-foreground">
              AEGIS AGENT
            </h1>
            <p className="text-[10px] tracking-[0.3em] uppercase text-slate-500">
              Regime-Adaptive Trading Intelligence
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${regimeColor}`}>
            <span className="text-[10px] font-bold tracking-wider">
              {regimeLabel}
            </span>
            {regimeData?.adx != null && regimeData.adx > 0 && (
              <span className="text-[9px] opacity-60">
                ADX {regimeData.adx.toFixed(0)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-400/10 border border-emerald-400/15">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-live text-emerald-400" />
            <span className="text-[10px] font-semibold tracking-wider text-emerald-400">
              LIVE
            </span>
          </div>
          <div className="glass px-3 py-1.5 rounded-full">
            <span className="text-[10px] tracking-wider text-slate-400">
              PAPER MODE
            </span>
          </div>
        </div>
      </motion.header>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Portfolio"
          value={`$${portfolio.equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subValue={`${pnlPositive ? "+" : ""}${portfolio.total_pnl.toFixed(2)} PnL`}
          icon={<Wallet size={22} strokeWidth={1.5} />}
          accentColor={pnlPositive ? "text-emerald-400" : "text-rose-400"}
          glowColor={pnlPositive ? "shadow-emerald-500/10" : "shadow-rose-500/10"}
          trend={pnlPositive ? "up" : "down"}
          delay={0}
        />
        <StatCard
          label="Drawdown"
          value={`${(portfolio.drawdown_pct * 100).toFixed(2)}%`}
          subValue="8% max limit"
          icon={<TrendingDown size={22} strokeWidth={1.5} />}
          accentColor={portfolio.drawdown_pct > 0.05 ? "text-rose-400" : "text-cyan-400"}
          glowColor="shadow-cyan-500/10"
          delay={0.05}
        />
        <StatCard
          label="Trades"
          value={String(stats.trade_count)}
          subValue={`${stats.rejection_count} rejected`}
          icon={<BarChart3 size={22} strokeWidth={1.5} />}
          accentColor="text-violet-400"
          glowColor="shadow-violet-500/10"
          delay={0.1}
        />
        <StatCard
          label="Validation Rate"
          value={`${stats.validation_rate.toFixed(0)}%`}
          subValue={`${stats.total_decisions} decisions`}
          icon={<Target size={22} strokeWidth={1.5} />}
          accentColor="text-amber-400"
          glowColor="shadow-amber-500/10"
          delay={0.15}
        />
      </div>

      {/* Agent Pipeline */}
      <div className="mb-6">
        <AgentPipeline
          signals={signalData?.signals || []}
          decision={
            artifacts && artifacts.length > 0
              ? artifacts[0]?.payload?.risk_decision
              : null
          }
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <EquityChart equity={portfolio.equity} pnl={portfolio.total_pnl} />
        </div>
        <div>
          <KillCriteriaPanel criteria={killCriteria} />
        </div>
      </div>

      {/* Trade History + Artifact Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <TradeHistory trades={tradeList || []} />
        <ArtifactLog artifacts={artifacts || []} />
      </div>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.5 }}
        className="mt-10 flex items-center justify-between text-[10px] text-slate-600 pb-4"
      >
        <span className="tracking-wider">
          ERC-8004 VALIDATED ON SEPOLIA (CHAIN 11155111)
        </span>
        <span className="font-mono">
          RISK ROUTER: 0xd6A6...FdBC
        </span>
      </motion.footer>
    </div>
  );
}
