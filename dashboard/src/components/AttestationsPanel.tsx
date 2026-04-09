"use client";

import { motion } from "framer-motion";
import { Link as LinkIcon, ShieldCheck, Sparkles, Activity } from "lucide-react";
import type { OnchainStatus } from "@/lib/api";

interface Props {
  status: OnchainStatus;
}

const ETHERSCAN_TX = "https://sepolia.etherscan.io/tx/";

const KIND_META: Record<
  string,
  { label: string; Icon: typeof ShieldCheck; color: string; bg: string }
> = {
  validation: {
    label: "Validation",
    Icon: ShieldCheck,
    color: "text-emerald-400",
    bg: "bg-emerald-400/8 border-emerald-400/15",
  },
  reputation: {
    label: "Reputation",
    Icon: Sparkles,
    color: "text-amber-400",
    bg: "bg-amber-400/8 border-amber-400/15",
  },
  trade_intent: {
    label: "Trade Intent",
    Icon: Activity,
    color: "text-sky-400",
    bg: "bg-sky-400/8 border-sky-400/15",
  },
};

function shortHash(h: string): string {
  if (!h) return "";
  const cleaned = h.startsWith("0x") ? h.slice(2) : h;
  return `0x${cleaned.slice(0, 6)}…${cleaned.slice(-4)}`;
}

function timeAgo(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff)) return "";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function AttestationsPanel({ status }: Props) {
  const totals = status.attestation_totals;
  const recent = status.recent_attestations ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.55 }}
      className="glass noise-overlay relative overflow-hidden p-6"
    >
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xs font-semibold tracking-[0.25em] uppercase text-slate-400 font-[family-name:var(--font-display)]">
            On-Chain Activity
          </h2>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-cyan-400">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 pulse-live" />
            SEPOLIA · ERC-8004
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="rounded-lg bg-sky-400/8 border border-sky-400/15 p-3">
            <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-1">
              Trades
            </div>
            <div className="text-lg font-bold text-sky-400 font-[family-name:var(--font-display)]">
              {totals.trade_intent}
            </div>
          </div>
          <div className="rounded-lg bg-emerald-400/8 border border-emerald-400/15 p-3">
            <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-1">
              Validations
            </div>
            <div className="text-lg font-bold text-emerald-400 font-[family-name:var(--font-display)]">
              {totals.validation}
            </div>
          </div>
          <div className="rounded-lg bg-amber-400/8 border border-amber-400/15 p-3">
            <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-1">
              Reputation
            </div>
            <div className="text-lg font-bold text-amber-400 font-[family-name:var(--font-display)]">
              {totals.reputation}
            </div>
          </div>
        </div>

        <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
          {recent.length === 0 ? (
            <div className="text-[11px] text-slate-500 italic py-3 text-center">
              No attestations recorded yet
            </div>
          ) : (
            recent.map((rec, i) => {
              const meta = KIND_META[rec.kind] ?? KIND_META.validation;
              const Icon = meta.Icon;
              return (
                <a
                  key={`${rec.tx_hash}-${i}`}
                  href={`${ETHERSCAN_TX}${rec.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center justify-between py-2 px-3 rounded-lg border transition-colors hover:bg-white/[0.04] ${meta.bg}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon size={14} className={meta.color} />
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-200 font-medium">
                          {meta.label}
                        </span>
                        {rec.pair && (
                          <span className="text-[9px] text-slate-500">
                            {rec.pair}
                          </span>
                        )}
                        {rec.score != null && (
                          <span className={`text-[9px] ${meta.color}`}>
                            {rec.score}
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] text-slate-500 font-mono truncate">
                        {shortHash(rec.tx_hash)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[9px] text-slate-500">
                      {timeAgo(rec.timestamp)}
                    </span>
                    <LinkIcon size={10} className="text-slate-600" />
                  </div>
                </a>
              );
            })
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-white/[0.04] text-[9px] text-slate-500 text-center">
          Tap any row to open the Sepolia transaction on Etherscan
        </div>
      </div>
    </motion.div>
  );
}
