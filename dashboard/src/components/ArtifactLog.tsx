"use client";

import { motion } from "framer-motion";
import { ExternalLink, FileCheck, FileX, Hash } from "lucide-react";
import type { Artifact } from "@/lib/api";

interface Props {
  artifacts: Artifact[];
}

export function ArtifactLog({ artifacts }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.6 }}
      className="glass noise-overlay relative overflow-hidden p-6"
    >
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xs font-semibold tracking-[0.25em] uppercase text-slate-400 font-[family-name:var(--font-display)]">
            ERC-8004 Validation Log
          </h2>
          <span className="text-[10px] text-slate-500 font-mono">
            {artifacts.length} artifacts
          </span>
        </div>

        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {artifacts.length === 0 && (
            <p className="text-xs text-slate-600 text-center py-8">
              No artifacts yet — agent will produce them on first cycle
            </p>
          )}

          {artifacts.map((artifact, i) => {
            const isTrade = artifact.type === "trade-execution";
            const pair = artifact.payload?.pair || "—";
            const approved = artifact.payload?.risk_decision?.approved;
            const side = artifact.payload?.intent?.side;
            const sizeUsd = artifact.payload?.intent?.size_usd;

            return (
              <motion.div
                key={artifact.hash || i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * i, duration: 0.3 }}
                className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors cursor-pointer group"
              >
                {isTrade ? (
                  <FileCheck size={14} className="text-emerald-400 shrink-0" />
                ) : (
                  <FileX size={14} className="text-slate-500 shrink-0" />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold tracking-wider ${
                        isTrade ? "text-emerald-400" : "text-slate-500"
                      }`}
                    >
                      {isTrade ? "TRADE" : "NO-TRADE"}
                    </span>
                    <span className="text-[10px] text-slate-400">{pair}</span>
                    {side && (
                      <span
                        className={`text-[10px] font-semibold ${
                          side === "long" ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {side.toUpperCase()}
                      </span>
                    )}
                    {sizeUsd && (
                      <span className="text-[10px] text-slate-500">
                        ${sizeUsd.toFixed(0)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Hash size={9} className="text-slate-600" />
                    <span className="text-[9px] font-mono text-slate-600 truncate">
                      {artifact.hash?.slice(0, 16)}...
                    </span>
                    <span className="text-[9px] text-slate-600">
                      {new Date(artifact.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                {artifact.payload?.receipt?.order_id && (
                  <a
                    href={`https://sepolia.etherscan.io/tx/${artifact.payload.receipt.order_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-400/50 hover:text-violet-400 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink size={12} />
                  </a>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
