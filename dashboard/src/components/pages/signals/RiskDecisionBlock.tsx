"use client";

import { useArtifacts } from "@/lib/hooks";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { NumericValue } from "@/components/ui/NumericValue";
import { KeyValueGrid } from "@/components/ui/KeyValueGrid";
import { EmptyState } from "@/components/ui/EmptyState";

type RiskDecision = {
  approved: boolean;
  reason_codes: string[];
  final_side: string;
  final_size_usd: number;
  exposure_before: number;
  exposure_after: number;
  daily_pnl: number;
  drawdown_pct: number;
  kill_switch_active: boolean;
};

export function RiskDecisionBlock() {
  const { data } = useArtifacts(1);
  const decision = data?.[0]?.payload?.risk_decision as unknown as
    | RiskDecision
    | undefined;

  return (
    <HairlineCard>
      <SectionHeader
        title="Risk Decision"
        rightSlot={
          decision ? (
            <StatusPill
              tone={decision.approved ? "ok" : "crit"}
              label={decision.approved ? "APPROVED" : "REJECTED"}
            />
          ) : undefined
        }
      />
      {!decision ? (
        <EmptyState label="No risk decision yet." />
      ) : (
        <div className="space-y-4">
          <KeyValueGrid
            items={[
              {
                k: "Final Side",
                v: (decision.final_side || "—").toUpperCase(),
              },
              {
                k: "Final Size USD",
                v: <NumericValue value={decision.final_size_usd} kind="usd" />,
              },
              {
                k: "Exposure Before",
                v: <NumericValue value={decision.exposure_before} kind="usd" />,
              },
              {
                k: "Exposure After",
                v: <NumericValue value={decision.exposure_after} kind="usd" />,
              },
              {
                k: "Daily PnL",
                v: (
                  <NumericValue
                    value={decision.daily_pnl}
                    kind="usd"
                    color="auto"
                  />
                ),
              },
              {
                k: "Drawdown",
                v: <NumericValue value={decision.drawdown_pct} kind="pct" />,
              },
            ]}
          />
          {decision.reason_codes && decision.reason_codes.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-muted)] mb-1.5">
                Reason Codes
              </div>
              <div className="flex flex-wrap gap-1">
                {decision.reason_codes.map((code) => (
                  <StatusPill key={code} tone="neutral" label={code} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </HairlineCard>
  );
}
