"use client";

import { motion } from "framer-motion";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import type { KillCriteria } from "@/lib/api";

const CRITERIA = [
  { key: "stale_data", label: "Data Freshness", desc: "< 5 min" },
  { key: "malformed_output", label: "Output Integrity", desc: "Valid JSON" },
  { key: "ledger_mismatch", label: "Ledger Match", desc: "Synced" },
  { key: "spread_too_wide", label: "Spread", desc: "< 20 bps" },
  { key: "daily_loss_breached", label: "Daily Loss", desc: "< 3%" },
  { key: "max_drawdown_breached", label: "Max Drawdown", desc: "< 8%" },
  { key: "kill_switch", label: "Kill Switch", desc: "Inactive" },
] as const;

interface Props {
  criteria: KillCriteria;
}

export function KillCriteriaPanel({ criteria }: Props) {
  const activeCount = Object.values(criteria).filter(Boolean).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5 }}
      className="glass noise-overlay relative overflow-hidden p-6"
    >
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xs font-semibold tracking-[0.25em] uppercase text-slate-400 font-[family-name:var(--font-display)]">
            Kill Criteria
          </h2>
          <div
            className={`flex items-center gap-1.5 text-[10px] font-semibold tracking-wider ${
              activeCount === 0 ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full pulse-live ${
                activeCount === 0 ? "bg-emerald-400 text-emerald-400" : "bg-rose-400 text-rose-400"
              }`}
            />
            {activeCount === 0 ? "ALL CLEAR" : `${activeCount} ACTIVE`}
          </div>
        </div>

        <div className="space-y-2">
          {CRITERIA.map(({ key, label, desc }) => {
            const triggered = criteria[key];
            return (
              <div
                key={key}
                className={`flex items-center justify-between py-2 px-3 rounded-lg transition-colors ${
                  triggered
                    ? "bg-rose-400/8 border border-rose-400/15"
                    : "bg-white/[0.02]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {triggered ? (
                    <ShieldAlert size={14} className="text-rose-400" />
                  ) : (
                    <ShieldCheck size={14} className="text-emerald-400/60" />
                  )}
                  <span className="text-xs text-slate-300">{label}</span>
                </div>
                <span
                  className={`text-[10px] font-medium ${
                    triggered ? "text-rose-400" : "text-slate-500"
                  }`}
                >
                  {triggered ? "TRIGGERED" : desc}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
