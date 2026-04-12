"use client";

import { useKillCriteria } from "@/lib/hooks";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { Skeleton } from "@/components/ui/Skeleton";

const CRITERIA: Array<{
  k: keyof import("@/lib/api").KillCriteria;
  label: string;
}> = [
  { k: "stale_data", label: "Data freshness" },
  { k: "malformed_output", label: "Output integrity" },
  { k: "ledger_mismatch", label: "Ledger reconciliation" },
  { k: "spread_too_wide", label: "Spread \u2264 20 bps" },
  { k: "daily_loss_breached", label: "Daily loss cap" },
  { k: "max_drawdown_breached", label: "Max drawdown" },
  { k: "kill_switch", label: "Kill switch" },
];

export function KillSummary() {
  const { data, isLoading } = useKillCriteria();

  if (isLoading || !data) {
    return (
      <HairlineCard>
        <SectionHeader
          title="Risk Governor"
          isLoading
          rightSlot={<Skeleton width={88} height={18} radius={9} />}
        />
        <ul className="text-[12px] space-y-1">
          {CRITERIA.map((c) => (
            <li
              key={c.k}
              className="flex items-center justify-between px-3 py-2 rounded-[10px]"
            >
              <span className="text-[color:var(--color-ink-soft)]">
                {c.label}
              </span>
              <Skeleton width={24} height={12} />
            </li>
          ))}
        </ul>
      </HairlineCard>
    );
  }

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
      <ul className="text-[12px] space-y-1">
        {CRITERIA.map((c) => {
          const bad = data[c.k] === true;
          return (
            <li
              key={c.k}
              className={`flex items-center justify-between px-3 py-2 rounded-[10px] cursor-default ${
                bad
                  ? "bg-[color:var(--color-loss-soft)] text-[color:var(--color-loss)]"
                  : "text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-hover)]"
              }`}
            >
              <span>{c.label}</span>
              <span className="num uppercase tracking-wider text-[9px] font-medium">
                {bad ? "TRIP" : "OK"}
              </span>
            </li>
          );
        })}
      </ul>
    </HairlineCard>
  );
}
