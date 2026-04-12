"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";

import { useArtifacts } from "@/lib/hooks";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";
import { NumericValue } from "@/components/ui/NumericValue";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";

const RATIONALE_COLLAPSED_CHARS = 260;

function directionTone(direction: string): PillTone {
  const d = direction?.toLowerCase();
  if (d === "long") return "ok";
  if (d === "short") return "crit";
  return "neutral";
}

function RationaleBody({ rationale }: { rationale: string }) {
  const [expanded, setExpanded] = useState(false);
  const reduceMotion = useReducedMotion();
  const isLong = rationale.length > RATIONALE_COLLAPSED_CHARS;
  const collapsed = !expanded && isLong
    ? `${rationale.slice(0, RATIONALE_COLLAPSED_CHARS).trimEnd()}\u2026`
    : rationale;

  if (!isLong) {
    return (
      <p className="text-[12px] leading-relaxed text-[color:var(--color-ink-soft)]">
        {rationale}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <AnimatePresence initial={false} mode="wait">
        <motion.p
          key={expanded ? "full" : "clipped"}
          initial={reduceMotion ? false : { opacity: 0, height: 0 }}
          animate={
            reduceMotion
              ? { opacity: 1, height: "auto" }
              : { opacity: 1, height: "auto" }
          }
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }
          }
          style={{ overflow: "hidden" }}
          className="text-[12px] leading-relaxed text-[color:var(--color-ink-soft)]"
        >
          {collapsed}
        </motion.p>
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="inline-flex items-center gap-1 self-start cursor-pointer rounded-md px-1.5 py-0.5 -ml-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--color-accent)] transition-colors duration-200 hover:bg-[color:var(--color-paper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)]"
      >
        {expanded ? (
          <>
            Show less <ChevronUp size={11} strokeWidth={2.4} />
          </>
        ) : (
          <>
            Show more <ChevronDown size={11} strokeWidth={2.4} />
          </>
        )}
      </button>
    </div>
  );
}

export function AnalystBlock() {
  const { data, isLoading } = useArtifacts(1);

  if (isLoading) {
    return (
      <HairlineCard>
        <SectionHeader title="LLM Analyst Report" />
        <div className="space-y-4">
          <div className="flex items-baseline gap-3">
            <Skeleton width={64} height={18} radius={9} />
            <Skeleton width={48} height={14} />
            <Skeleton width={96} height={10} />
          </div>
          <SkeletonText lines={4} widths={["100%", "96%", "88%", "70%"]} />
        </div>
      </HairlineCard>
    );
  }

  const analyst = data?.[0]?.payload?.analyst;

  return (
    <HairlineCard>
      <SectionHeader title="LLM Analyst Report" />
      {!analyst ? (
        <EmptyState label="No analyst report yet." />
      ) : (
        <div className="space-y-4">
          <div className="flex items-baseline gap-3 flex-wrap">
            <StatusPill
              tone={directionTone(analyst.direction)}
              label={(analyst.direction || "hold").toUpperCase()}
            />
            <span className="flex items-baseline gap-1.5">
              <NumericValue
                value={analyst.conviction}
                kind="int"
                className="text-[14px] text-[color:var(--color-ink)] font-semibold"
              />
              <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-muted)] font-medium">
                conv
              </span>
            </span>
            {analyst.regime_assessment && (
              <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-muted)] font-medium">
                {analyst.regime_assessment}
              </span>
            )}
          </div>
          <RationaleBody rationale={analyst.rationale || ""} />
          {analyst.key_risks && analyst.key_risks.length > 0 && (
            <div className="bg-[color:var(--color-loss-soft)] px-4 py-3 border border-[color:var(--color-loss)]/15 rounded-lg">
              <SectionHeader title="Key Risks" />
              <ul
                className="text-[12px] text-[color:var(--color-ink-soft)] pl-5 space-y-1"
                style={{ listStyleType: "disc" }}
              >
                {analyst.key_risks.map((risk, i) => (
                  <li key={i}>{risk}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </HairlineCard>
  );
}
