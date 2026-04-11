"use client";

import { useArtifacts } from "@/lib/hooks";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";
import { EmptyState } from "@/components/ui/EmptyState";

function directionTone(direction: string): PillTone {
  const d = direction?.toLowerCase();
  if (d === "long") return "ok";
  if (d === "short") return "crit";
  return "neutral";
}

export function LlmAnalystSection() {
  const { data } = useArtifacts(1);
  const analyst = data?.[0]?.payload?.analyst;

  return (
    <HairlineCard>
      <SectionHeader title="GPT Meta-Analyst" />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6">
        <div className="space-y-3">
          <p className="text-[12px] text-[color:var(--color-muted)] leading-relaxed">
            Aegis sends all 6 deterministic signal reports, 16 feature values, and PRISM external
            intelligence to GPT. The LLM returns a structured Pydantic response: unified direction,
            conviction score (0{"\u2013"}100), rationale, regime assessment, and key risks. If the API
            is unavailable, a deterministic fallback produces the same schema from signal consensus.
          </p>
          <div>
            <div className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--color-muted)] font-medium mb-1">
              Capabilities
            </div>
            <ul className="text-[11px] text-[color:var(--color-ink-soft)] space-y-1 pl-4" style={{ listStyleType: "disc" }}>
              <li>Signal consensus weighting</li>
              <li>Conflict resolution between agents</li>
              <li>Regime-aware conviction calibration</li>
              <li>PRISM external intelligence enrichment</li>
              <li>Deterministic fallback if API unavailable</li>
            </ul>
          </div>
        </div>
        <div
          className="rounded-xl p-4"
          style={{ background: "rgba(0, 0, 0, 0.02)" }}
        >
          {!analyst ? (
            <EmptyState label="No analyst report in current cycle." />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <StatusPill
                  tone={directionTone(analyst.direction)}
                  label={(analyst.direction || "HOLD").toUpperCase()}
                />
                <span className="num text-[20px] font-semibold text-[color:var(--color-ink)]">
                  {analyst.conviction}
                </span>
                <span className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--color-muted)] font-medium">
                  conviction
                </span>
                {analyst.regime_assessment && (
                  <StatusPill tone="neutral" label={analyst.regime_assessment.toUpperCase()} />
                )}
              </div>
              <p className="text-[13px] text-[color:var(--color-ink-soft)] leading-relaxed">
                {analyst.rationale}
              </p>
              {analyst.key_risks && analyst.key_risks.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--color-muted)] font-medium mb-1">
                    Key Risks
                  </div>
                  <ul className="text-[12px] text-[color:var(--color-ink-soft)] pl-4 space-y-0.5" style={{ listStyleType: "disc" }}>
                    {analyst.key_risks.map((risk, i) => (
                      <li key={i}>{risk}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </HairlineCard>
  );
}
