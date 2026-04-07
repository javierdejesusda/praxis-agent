"use client";

import { motion } from "framer-motion";
import {
  Shield,
  TrendingUp,
  Activity,
  DollarSign,
  Brain,
  Eye,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Repeat,
  Gauge,
} from "lucide-react";
import type { Signal } from "@/lib/api";

const AGENTS = [
  { id: "auditor", name: "Data Auditor", icon: Eye, color: "text-cyan-400", bg: "bg-cyan-400/10" },
  { id: "trend", name: "Trend", icon: TrendingUp, color: "text-amber-400", bg: "bg-amber-400/10" },
  { id: "volatility", name: "Volatility", icon: Activity, color: "text-violet-400", bg: "bg-violet-400/10" },
  { id: "spread_cost", name: "Spread/Cost", icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-400/10" },
  { id: "mean_reversion", name: "Mean-Rev", icon: Repeat, color: "text-sky-400", bg: "bg-sky-400/10" },
  { id: "momentum", name: "Momentum", icon: Gauge, color: "text-orange-400", bg: "bg-orange-400/10" },
  { id: "analyst", name: "LLM Analyst", icon: Brain, color: "text-rose-400", bg: "bg-rose-400/10" },
  { id: "governor", name: "Risk Governor", icon: Shield, color: "text-amber-400", bg: "bg-amber-400/10" },
];

interface AgentPipelineProps {
  signals: Signal[];
  decision?: { approved: boolean; reason_codes: string[] } | null;
}

function getSignalForAgent(signals: Signal[], agentId: string): Signal | undefined {
  return signals.find((s) => s.agent_name === agentId);
}

export function AgentPipeline({ signals, decision }: AgentPipelineProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.3 }}
      className="glass noise-overlay relative overflow-hidden p-6"
    >
      <div className="relative z-10">
        <h2 className="text-xs font-semibold tracking-[0.25em] uppercase text-slate-400 mb-6 font-[family-name:var(--font-display)]">
          Agent Pipeline
        </h2>

        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {AGENTS.map((agent, i) => {
            const signal = getSignalForAgent(signals, agent.id);
            const isActive = !!signal;
            const confidence = signal?.confidence ?? 0;
            const direction = signal?.direction ?? "hold";
            const Icon = agent.icon;

            return (
              <div key={agent.id} className="flex items-center gap-2">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1 * i, duration: 0.4 }}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl min-w-[90px] cursor-pointer transition-all duration-300 ${
                    isActive
                      ? `${agent.bg} border border-white/10`
                      : "bg-white/[0.02] border border-white/[0.04]"
                  }`}
                >
                  <div className={`${agent.color} transition-colors`}>
                    <Icon size={20} strokeWidth={1.5} />
                  </div>
                  <span className="text-[10px] text-slate-400 text-center leading-tight whitespace-nowrap">
                    {agent.name}
                  </span>
                  {isActive && (
                    <div className="flex items-center gap-1">
                      <span
                        className={`text-[10px] font-bold ${
                          direction === "long"
                            ? "text-emerald-400"
                            : direction === "short"
                            ? "text-rose-400"
                            : "text-slate-500"
                        }`}
                      >
                        {direction.toUpperCase()}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {confidence.toFixed(0)}%
                      </span>
                    </div>
                  )}
                </motion.div>
                {i < AGENTS.length - 1 && (
                  <ArrowRight size={14} className="text-slate-700 shrink-0" />
                )}
              </div>
            );
          })}

          <ArrowRight size={14} className="text-slate-700 shrink-0" />

          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.4 }}
            className={`flex flex-col items-center gap-2 p-3 rounded-xl min-w-[90px] border ${
              decision?.approved
                ? "bg-emerald-400/10 border-emerald-400/20"
                : decision
                ? "bg-rose-400/10 border-rose-400/20"
                : "bg-white/[0.02] border-white/[0.04]"
            }`}
          >
            {decision?.approved ? (
              <CheckCircle2 size={20} className="text-emerald-400" />
            ) : decision ? (
              <XCircle size={20} className="text-rose-400" />
            ) : (
              <div className="w-5 h-5 rounded-full border-2 border-slate-600 border-t-transparent animate-spin" />
            )}
            <span className="text-[10px] text-slate-400 text-center">
              {decision?.approved ? "EXECUTE" : decision ? "REJECT" : "PENDING"}
            </span>
            {decision && !decision.approved && (
              <span className="text-[9px] text-rose-400/70 text-center">
                {decision.reason_codes?.[0]}
              </span>
            )}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
