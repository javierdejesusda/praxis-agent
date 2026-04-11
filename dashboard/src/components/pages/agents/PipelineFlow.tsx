"use client";

import { ArrowRight } from "lucide-react";

const STEPS = [
  {
    label: "Market Data",
    sub: "OHLCV, 200+ bars",
    color: "#86868B",
  },
  {
    label: "Feature Engine",
    sub: "16 indicators (pandas_ta)",
    color: "#86868B",
  },
  {
    label: "6 Signal Agents",
    sub: "Parallel, deterministic",
    color: "#2979FF",
  },
  {
    label: "GPT Analyst",
    sub: "Meta-analysis + PRISM",
    color: "#2979FF",
  },
  {
    label: "Risk Governor",
    sub: "7 kill criteria, Half-Kelly",
    color: "#FF1744",
  },
  {
    label: "Dual Execution",
    sub: "Kraken paper + ERC-8004",
    color: "#00C853",
  },
];

export function PipelineFlow() {
  return (
    <div className="flex items-center gap-2 overflow-x-auto py-2">
      {STEPS.map((step, i) => (
        <div key={step.label} className="flex items-center gap-2 shrink-0">
          <div
            className="px-4 py-3 rounded-xl text-center min-w-[130px]"
            style={{
              background: "rgba(255, 255, 255, 0.8)",
              backdropFilter: "blur(12px)",
              border: `1.5px solid ${step.color}30`,
            }}
          >
            <div className="text-[12px] font-semibold text-[color:var(--color-ink)]">
              {step.label}
            </div>
            <div className="text-[10px] text-[color:var(--color-muted)] mt-0.5">
              {step.sub}
            </div>
          </div>
          {i < STEPS.length - 1 && (
            <ArrowRight size={14} className="text-[color:var(--color-muted-soft)] shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}
