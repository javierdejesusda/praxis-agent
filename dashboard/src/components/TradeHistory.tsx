"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import type { Artifact } from "@/lib/api";

interface Props {
  trades: Artifact[];
}

export function TradeHistory({ trades }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
            Trade History
          </h2>
          <span className="text-[10px] text-slate-500 font-mono">
            {trades.length} trades
          </span>
        </div>

        {trades.length === 0 && (
          <p className="text-xs text-slate-600 text-center py-8">
            No trades executed yet
          </p>
        )}

        <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
          {trades.map((trade, i) => {
            const id = trade.hash || String(i);
            const isExpanded = expandedId === id;
            const intent = trade.payload?.intent;
            const receipt = trade.payload?.receipt;
            const decision = trade.payload?.risk_decision;
            const pair = trade.payload?.pair || intent?.pair || "—";
            const side = intent?.side;
            const sizeUsd = intent?.size_usd;

            return (
              <div key={id}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : id)}
                  className="w-full flex items-center gap-3 py-2.5 px-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors text-left"
                >
                  {isExpanded ? (
                    <ChevronDown size={12} className="text-slate-500 shrink-0" />
                  ) : (
                    <ChevronRight size={12} className="text-slate-500 shrink-0" />
                  )}

                  <div className="flex-1 flex items-center gap-3 min-w-0">
                    <span className="text-[10px] text-slate-400 font-mono w-14 shrink-0">
                      {new Date(trade.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="text-xs text-slate-300 w-16 shrink-0">{pair}</span>
                    {side && (
                      <span
                        className={`text-[10px] font-bold tracking-wider w-12 ${
                          side === "long" ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {side.toUpperCase()}
                      </span>
                    )}
                    {sizeUsd != null && (
                      <span className="text-xs text-slate-400">${sizeUsd.toFixed(2)}</span>
                    )}
                  </div>

                  <span
                    className={`text-[10px] font-semibold tracking-wider shrink-0 ${
                      receipt?.status === "filled"
                        ? "text-emerald-400"
                        : receipt?.status === "approved"
                        ? "text-violet-400"
                        : "text-slate-500"
                    }`}
                  >
                    {receipt?.status?.toUpperCase() || "—"}
                  </span>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 py-3 ml-6 space-y-2 border-l border-white/[0.06]">
                        {receipt?.fill_price != null && (
                          <DetailRow label="Fill Price" value={`$${receipt.fill_price.toLocaleString()}`} />
                        )}
                        {decision?.drawdown_pct != null && (
                          <DetailRow
                            label="Drawdown"
                            value={`${(decision.drawdown_pct * 100).toFixed(2)}%`}
                          />
                        )}
                        {decision?.reason_codes && (
                          <DetailRow
                            label="Reason"
                            value={decision.reason_codes.join(", ")}
                          />
                        )}
                        {trade.hash && (
                          <DetailRow
                            label="Artifact Hash"
                            value={trade.hash.slice(0, 24) + "..."}
                            mono
                          />
                        )}
                        {receipt?.order_id && receipt.order_id.startsWith("0x") && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 w-24">Sepolia TX</span>
                            <a
                              href={`https://sepolia.etherscan.io/tx/${receipt.order_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-violet-400 hover:text-violet-300 flex items-center gap-1"
                            >
                              {receipt.order_id.slice(0, 16)}...
                              <ExternalLink size={10} />
                            </a>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-500 w-24">{label}</span>
      <span className={`text-[10px] text-slate-300 ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}
