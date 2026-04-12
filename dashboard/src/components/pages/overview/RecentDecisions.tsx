"use client";

import { useArtifacts } from "@/lib/hooks";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { Skeleton } from "@/components/ui/Skeleton";
import { fmtTimestamp } from "@/lib/format";

export function RecentDecisions() {
  const { data: artifacts, isLoading } = useArtifacts(10);

  const newestTs =
    artifacts && artifacts.length > 0 ? artifacts[0].timestamp : null;

  if (isLoading) {
    return (
      <HairlineCard>
        <SectionHeader title="Recent Decisions" isLoading />
        <div className="space-y-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 py-2.5 border-b border-[color:var(--color-rule)] last:border-b-0"
            >
              <Skeleton width={56} height={18} radius={9} />
              <Skeleton width={60} height={12} />
              <Skeleton width={48} height={18} radius={9} />
              <Skeleton width="100%" height={12} />
              <Skeleton width={80} height={10} />
            </div>
          ))}
        </div>
      </HairlineCard>
    );
  }

  return (
    <HairlineCard>
      <SectionHeader title="Recent Decisions" updatedAt={newestTs} />
      {!artifacts || artifacts.length === 0 ? (
        <div className="text-[12px] text-[color:var(--color-muted)]">
          No decisions yet. Waiting for first strategic cycle.
        </div>
      ) : (
        <div className="space-y-0">
          {artifacts.map((a, i) => {
            const isTrade = a.type === "trade-execution";
            const isClose = a.type === "position-close";
            const pair = a.payload?.pair ?? "";
            const reasons =
              a.payload?.risk_decision?.reason_codes?.join(", ") ?? "";
            const direction =
              a.payload?.risk_decision?.final_side ??
              a.payload?.analyst?.direction ??
              "";
            const conviction = a.payload?.analyst?.conviction;

            return (
              <div
                key={a.hash || i}
                className="flex items-center gap-3 py-2.5 border-b border-[color:var(--color-rule)] last:border-b-0"
              >
                <StatusPill
                  tone={isTrade ? "ok" : isClose ? "info" : "crit"}
                  label={isTrade ? "TRADE" : isClose ? "CLOSE" : "REJECTED"}
                />
                <span className="text-[12px] font-medium text-[color:var(--color-ink)] min-w-[60px]">
                  {pair}
                </span>
                {direction && (
                  <StatusPill
                    tone={
                      direction === "long"
                        ? "ok"
                        : direction === "short"
                          ? "crit"
                          : "neutral"
                    }
                    label={direction.toUpperCase()}
                  />
                )}
                {conviction != null && (
                  <span className="num text-[11px] text-[color:var(--color-muted)]">
                    {Math.round(Number(conviction))} conv
                  </span>
                )}
                <span className="text-[11px] text-[color:var(--color-muted)] flex-1 truncate">
                  {reasons}
                </span>
                <span className="text-[10px] text-[color:var(--color-muted)] tabular-nums shrink-0">
                  {fmtTimestamp(a.timestamp)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </HairlineCard>
  );
}
