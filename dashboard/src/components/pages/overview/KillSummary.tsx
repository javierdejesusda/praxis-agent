"use client";

import { useKillCriteria } from "@/lib/hooks";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusPill } from "@/components/ui/StatusPill";

const CRITERIA: Array<{ k: keyof import("@/lib/api").KillCriteria; label: string }> = [
  { k: "stale_data", label: "Data freshness" },
  { k: "malformed_output", label: "Output integrity" },
  { k: "ledger_mismatch", label: "Ledger reconciliation" },
  { k: "spread_too_wide", label: "Spread ≤ 20 bps" },
  { k: "daily_loss_breached", label: "Daily loss cap" },
  { k: "max_drawdown_breached", label: "Max drawdown" },
  { k: "kill_switch", label: "Kill switch" },
];

export function KillSummary() {
  const { data } = useKillCriteria();
  if (!data) return null;
  const tripped = CRITERIA.filter((c) => data[c.k] === true);
  const allOk = tripped.length === 0;
  return (
    <HairlineCard>
      <SectionHeader
        title="Risk Governor"
        rightSlot={
          <StatusPill
            tone={allOk ? "ok" : "crit"}
            label={allOk ? "ALL NOMINAL" : `${tripped.length} TRIPPED`}
          />
        }
      />
      <ul className="text-[11px] space-y-0.5">
        {CRITERIA.map((c) => {
          const bad = data[c.k] === true;
          return (
            <li
              key={c.k}
              className={`flex items-center justify-between px-1.5 py-0.5 ${
                bad ? "bg-[color:var(--color-loss-soft)] text-[color:var(--color-loss)]" : "text-[color:var(--color-ink-soft)]"
              }`}
            >
              <span>{c.label}</span>
              <span className="num uppercase tracking-wider text-[9px]">
                {bad ? "TRIP" : "OK"}
              </span>
            </li>
          );
        })}
      </ul>
    </HairlineCard>
  );
}
