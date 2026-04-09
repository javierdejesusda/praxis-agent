"use client";

import { useArtifacts } from "@/lib/hooks";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";
import { NumericValue } from "@/components/ui/NumericValue";
import { EmptyState } from "@/components/ui/EmptyState";

function directionTone(direction: string): PillTone {
  const d = direction?.toLowerCase();
  if (d === "long") return "ok";
  if (d === "short") return "crit";
  return "neutral";
}

export function AnalystBlock() {
  const { data } = useArtifacts(1);
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
                className="text-[14px] text-[color:var(--color-ink)]"
              />
              <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-muted)]">
                conv
              </span>
            </span>
            {analyst.regime_assessment && (
              <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-muted)]">
                {analyst.regime_assessment}
              </span>
            )}
          </div>
          <p className="text-[12px] leading-relaxed text-[color:var(--color-ink-soft)]">
            {analyst.rationale}
          </p>
          {analyst.key_risks && analyst.key_risks.length > 0 && (
            <div
              className="bg-[color:var(--color-loss-soft)] px-3 py-2 border border-[color:var(--color-loss)]/20"
              style={{ borderRadius: 2 }}
            >
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
