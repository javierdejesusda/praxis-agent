"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { useKillCriteria, useRegime } from "@/lib/hooks";
import { toggleTimezoneMode, useTimezoneMode } from "@/lib/timezone";
import { StatusPill } from "@/components/ui/StatusPill";
import { LastUpdated } from "./LastUpdated";
import { StatusIndicator } from "./StatusIndicator";
import { TickerTape } from "./TickerTape";

const EMPTY = () => () => {};
const getTrue = () => true;
const getFalse = () => false;

export function TopBar() {
  const { data: kill } = useKillCriteria();
  const { data: regime } = useRegime();
  const { resolvedTheme, setTheme } = useTheme();
  const tzMode = useTimezoneMode();

  const mounted = useSyncExternalStore(EMPTY, getTrue, getFalse);

  const killAny = kill
    ? Object.values(kill).some((v) => v === true)
    : false;
  const killTone: "ok" | "crit" = killAny ? "crit" : "ok";
  const killLabel = killAny ? "KILL TRIPPED" : "ALL SYSTEMS";

  const isDark = mounted && resolvedTheme === "dark";
  const nextThemeLabel = isDark ? "light" : "dark";

  return (
    <header
      className="h-14 flex items-stretch relative z-20 border-b border-[color:var(--color-rule)]"
      style={{
        background: "var(--color-surface)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
      }}
    >
      <div className="flex items-center gap-3 px-5 border-r border-[color:var(--color-rule)] min-w-[220px]">
        <span className="text-[20px] font-semibold tracking-[-0.03em] text-[color:var(--color-ink)]">
          Praxis
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
        <button
          type="button"
          onClick={toggleTimezoneMode}
          aria-label={`Timezone: ${tzMode}. Switch to ${tzMode === "UTC" ? "local time" : "UTC"}`}
          title={`Timezone: ${tzMode} (click to switch)`}
          className="num text-[10px] font-medium uppercase tracking-[0.08em] text-[color:var(--color-ink-soft)] px-2 py-1 rounded-md border border-[color:var(--color-rule)] hover:bg-[color:var(--color-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-accent)]"
        >
          {tzMode}
        </button>
        <button
          type="button"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          aria-label={`Theme: ${mounted ? (isDark ? "dark" : "light") : "system"}. Switch to ${nextThemeLabel} mode`}
          title={`Switch to ${nextThemeLabel} mode`}
          className="flex items-center justify-center w-7 h-7 rounded-md border border-[color:var(--color-rule)] text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-accent)]"
        >
          {mounted && isDark ? <Sun size={14} strokeWidth={1.75} /> : <Moon size={14} strokeWidth={1.75} />}
        </button>
        <LastUpdated iso={regime?.timestamp ?? null} />
      </div>
    </header>
  );
}
