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
    <header
      className="h-14 flex items-stretch relative z-20"
      style={{
        background: "rgba(255, 255, 255, 0.72)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
        borderBottom: "1px solid rgba(0, 0, 0, 0.08)",
      }}
    >
      <div className="flex items-center gap-3 px-5 border-r border-[color:var(--color-rule)] min-w-[220px]">
        <span className="text-[20px] font-semibold tracking-[-0.03em] text-[color:var(--color-ink)]">
          Aegis
        </span>
        <span className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-muted)] font-medium">
          Trading
        </span>
      </div>
      <TickerTape />
      <div className="flex-1 flex items-center justify-end gap-4 px-5">
        <StatusIndicator tone={killTone} label={killLabel} />
        <StatusPill tone="neutral" label={regime?.regime?.toUpperCase() || "UNKNOWN"} />
        <StatusPill tone="info" label="PAPER" />
        <LastUpdated iso={regime?.timestamp ?? null} />
      </div>
    </header>
  );
}
