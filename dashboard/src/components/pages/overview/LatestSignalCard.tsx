"use client";

import { useArtifacts } from "@/lib/hooks";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { NumericValue } from "@/components/ui/NumericValue";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";

export function LatestSignalCard() {
  const { data: artifacts, isLoading } = useArtifacts(1);

  if (isLoading) {
    return (
      <HairlineCard>
        <SectionHeader
          title="Latest Signal"
          rightSlot={<Skeleton width={80} height={18} radius={9} />}
        />
        <div className="space-y-2">
          <div className="flex items-baseline gap-3">
            <Skeleton width={60} height={18} radius={9} />
            <Skeleton width={40} height={14} />
            <Skeleton width={80} height={10} />
          </div>
          <SkeletonText lines={3} widths={["100%", "92%", "76%"]} />
        </div>
      </HairlineCard>
    );
  }

  const latest = artifacts?.[0];
  const analyst = latest?.payload?.analyst;
  const decision = latest?.payload?.risk_decision;

  const directionTone =
    analyst?.direction === "long"
      ? "ok"
      : analyst?.direction === "short"
        ? "crit"
        : "neutral";

  return (
    <HairlineCard>
      <SectionHeader
        title="Latest Signal"
        rightSlot={
          decision ? (
            <StatusPill
              tone={decision.approved ? "ok" : "crit"}
              label={decision.approved ? "APPROVED" : "REJECTED"}
            />
          ) : undefined
        }
      />
      {!analyst ? (
        <div className="text-[12px] text-[color:var(--color-muted)]">
          No signal yet.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-baseline gap-3">
            <StatusPill
              tone={directionTone}
              label={(analyst.direction || "HOLD").toUpperCase()}
            />
            <span className="num text-[14px] text-[color:var(--color-ink)]">
              <NumericValue value={analyst.conviction} kind="int" /> conv
            </span>
            <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-muted)]">
              {analyst.regime_assessment}
            </span>
          </div>
          <p className="text-[12px] text-[color:var(--color-ink-soft)] leading-snug line-clamp-3">
            {analyst.rationale}
          </p>
        </div>
      )}
    </HairlineCard>
  );
}
