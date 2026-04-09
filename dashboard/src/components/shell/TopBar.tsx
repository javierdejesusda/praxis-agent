"use client";

import { useKillCriteria, useRegime } from "@/lib/hooks";
import { StatusIndicator } from "./StatusIndicator";
import { TickerTape } from "./TickerTape";
import { LastUpdated } from "./LastUpdated";
import { StatusPill } from "@/components/ui/StatusPill";

export function TopBar() {
  const { data: kill } = useKillCriteria();
  const { data: regime } = useRegime();

  const killAny = kill
    ? Object.values(kill).some((v) => v === true)
    : false;
  const killTone: "ok" | "crit" = killAny ? "crit" : "ok";
  const killLabel = killAny ? "KILL TRIPPED" : "ALL SYSTEMS";

  return (
    <header className="h-12 flex items-stretch border-b border-[color:var(--color-rule-strong)] bg-[color:var(--color-bone)]">
      <div className="flex items-center gap-3 px-4 border-r border-[color:var(--color-rule)] min-w-[200px]">
        <span
          className="text-[16px] font-semibold tracking-tight text-[color:var(--color-ink)]"
          style={{ fontFamily: "var(--font-serif), serif" }}
        >
          AEGIS
        </span>
        <span className="text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-muted)]">
          Trading Ops
        </span>
      </div>
      <TickerTape />
      <div className="flex-1 flex items-center justify-end gap-4 px-4">
        <StatusIndicator tone={killTone} label={killLabel} />
        <StatusPill tone="neutral" label={regime?.regime?.toUpperCase() || "UNKNOWN"} />
        <StatusPill tone="info" label="PAPER" />
        <LastUpdated iso={regime?.timestamp ?? null} />
      </div>
    </header>
  );
}
