"use client";

import { memo, useEffect, useRef } from "react";
import { useAnimationControls, useReducedMotion, motion } from "framer-motion";

import { StatusPill, type PillTone } from "@/components/ui/StatusPill";

export type AgentInfo = {
  name: string;
  description: string;
  inputs: string[];
  logic: string;
};

function directionTone(dir: string | undefined): PillTone {
  if (!dir) return "neutral";
  const d = dir.toLowerCase();
  if (d === "long") return "ok";
  if (d === "short") return "crit";
  return "neutral";
}

type AgentCardProps = {
  agent: AgentInfo;
  direction?: string;
  confidence?: number;
  decisionId?: string | null;
};

function AgentCardImpl({
  agent,
  direction,
  confidence,
  decisionId,
}: AgentCardProps) {
  const conf = confidence ?? 0;
  const pct = Math.max(0, Math.min(100, conf));
  const barColor =
    conf >= 70 ? "#00C853" : conf >= 40 ? "#FF9100" : "#86868B";

  const prefersReducedMotion = useReducedMotion();
  const controls = useAnimationControls();
  const lastIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!decisionId) {
      lastIdRef.current = null;
      return;
    }
    if (lastIdRef.current === decisionId) return;
    const isFirst = lastIdRef.current === null;
    lastIdRef.current = decisionId;
    if (isFirst) return;

    if (prefersReducedMotion) {
      controls.start({
        borderColor: ["var(--color-accent)", "var(--color-rule)"],
        transition: { duration: 0.2, times: [0, 1] },
      });
      return;
    }
    controls.start({
      borderColor: [
        "var(--color-rule)",
        "var(--color-accent)",
        "var(--color-rule)",
      ],
      scale: [1, 1.015, 1],
      transition: {
        duration: 0.6,
        times: [0, 0.5, 1],
        ease: [0.25, 0.1, 0.25, 1],
      },
    });
  }, [decisionId, controls, prefersReducedMotion]);

  return (
    <motion.div
      animate={controls}
      initial={false}
      className="rounded-2xl p-5 flex flex-col gap-4"
      style={{
        background: "var(--color-surface)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
        border: "1px solid var(--color-rule)",
        boxShadow:
          "0 0.5px 1px rgba(0, 0, 0, 0.03), 0 2px 8px rgba(0, 0, 0, 0.02)",
        transition:
          "box-shadow 300ms cubic-bezier(0.25,0.1,0.25,1), transform 300ms cubic-bezier(0.25,0.1,0.25,1)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow =
          "0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow =
          "0 0.5px 1px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.02)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-[15px] font-semibold text-[color:var(--color-ink)] tracking-[-0.02em]">
            {agent.name}
          </h3>
          <p className="text-[12px] text-[color:var(--color-muted)] mt-1 leading-relaxed">
            {agent.description}
          </p>
        </div>
        {direction && (
          <StatusPill
            tone={directionTone(direction)}
            label={direction.toUpperCase()}
          />
        )}
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--color-muted)] font-medium mb-1">
          Inputs
        </div>
        <div className="flex flex-wrap gap-1">
          {agent.inputs.map((inp) => (
            <span
              key={inp}
              className="text-[10px] px-2 py-0.5 rounded-full text-[color:var(--color-ink-soft)]"
              style={{ background: "var(--color-hover)" }}
            >
              {inp}
            </span>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--color-muted)] font-medium">
            Confidence
          </span>
          <span className="num text-[13px] font-semibold text-[color:var(--color-ink)] tabular-nums">
            {conf}%
          </span>
        </div>
        <div className="h-1.5 rounded-full" style={{ background: "var(--color-rule)" }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: barColor,
              transition: "width 400ms cubic-bezier(0.25,0.1,0.25,1)",
            }}
          />
        </div>
      </div>

      <p className="text-[11px] text-[color:var(--color-muted)] leading-relaxed italic">
        {agent.logic}
      </p>
    </motion.div>
  );
}

export const AgentCard = memo(AgentCardImpl);
