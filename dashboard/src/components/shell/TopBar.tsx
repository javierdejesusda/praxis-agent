"use client";

import { BookOpen, Menu, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { setHowItWorksOpen } from "@/components/how-it-works/how-it-works-store";
import { useHealth, useKillCriteria, useRegime } from "@/lib/hooks";
import { setMobileNavOpen } from "@/lib/mobile-nav";
import { toggleTimezoneMode, useTimezoneMode } from "@/lib/timezone";
import { StatusPill } from "@/components/ui/StatusPill";
import { CostWidget } from "./CostWidget";
import { LastUpdated } from "./LastUpdated";
import { StatusIndicator } from "./StatusIndicator";

const EMPTY = () => () => {};
const getTrue = () => true;
const getFalse = () => false;

function GithubMark({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .5C5.73.5.75 5.48.75 11.75c0 4.98 3.23 9.2 7.71 10.7.56.1.77-.25.77-.55 0-.27-.01-1.17-.02-2.12-3.14.68-3.8-1.34-3.8-1.34-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.14.08 1.73 1.17 1.73 1.17 1 1.72 2.64 1.22 3.28.93.1-.73.39-1.22.71-1.5-2.5-.28-5.14-1.25-5.14-5.57 0-1.23.44-2.24 1.17-3.03-.12-.29-.51-1.44.11-3 0 0 .95-.3 3.12 1.15.9-.25 1.87-.37 2.83-.38.96.01 1.93.13 2.83.38 2.17-1.45 3.12-1.15 3.12-1.15.62 1.56.23 2.71.11 3 .73.79 1.17 1.8 1.17 3.03 0 4.33-2.65 5.29-5.17 5.57.41.35.77 1.04.77 2.1 0 1.52-.01 2.74-.01 3.11 0 .3.2.66.78.55 4.48-1.5 7.7-5.72 7.7-10.7C23.25 5.48 18.27.5 12 .5z" />
    </svg>
  );
}

export function TopBar() {
  const { data: kill } = useKillCriteria();
  const { data: regime } = useRegime();
  const { data: health } = useHealth();
  const { resolvedTheme, setTheme } = useTheme();
  const tzMode = useTimezoneMode();

  const execMode = health?.execution_mode;
  const modeLabel =
    execMode === "live" ? "LIVE" : execMode === "paper" ? "PAPER" : null;
  const modeTone: "ok" | "info" = execMode === "live" ? "ok" : "info";

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
      <button
        type="button"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Open navigation"
        className="md:hidden flex items-center justify-center w-11 h-full px-3 border-r border-[color:var(--color-rule)] text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-accent)]"
      >
        <Menu size={18} strokeWidth={1.75} />
      </button>
      <div className="flex items-center gap-3 px-4 md:px-5 border-r border-[color:var(--color-rule)] md:min-w-[220px]">
        <span className="text-[20px] font-semibold tracking-[-0.03em] text-[color:var(--color-ink)]">
          Praxis
        </span>
        <span className="hidden sm:inline text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-muted)] font-medium">
          Trading
        </span>
      </div>
      <div className="flex-1" />
      <div className="flex items-center justify-end gap-2 md:gap-4 px-3 md:px-5">
        <div className="hidden md:block">
          <StatusIndicator tone={killTone} label={killLabel} />
        </div>
        <StatusPill tone="neutral" label={regime?.regime?.toUpperCase() || "UNKNOWN"} />
        {modeLabel && (
          <div className="hidden sm:block">
            <StatusPill tone={modeTone} label={modeLabel} />
          </div>
        )}
        <button
          type="button"
          onClick={toggleTimezoneMode}
          aria-label={`Timezone: ${tzMode}. Switch to ${tzMode === "UTC" ? "local time" : "UTC"}`}
          title={`Timezone: ${tzMode} (click to switch)`}
          className="hidden sm:inline-block num text-[10px] font-medium uppercase tracking-[0.08em] text-[color:var(--color-ink-soft)] px-2 py-1 rounded-md border border-[color:var(--color-rule)] hover:bg-[color:var(--color-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-accent)]"
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
        <CostWidget />
        <button
          type="button"
          onClick={() => setHowItWorksOpen(true)}
          aria-label="How Praxis Agent works"
          title="How it works"
          className="hidden md:flex items-center justify-center w-7 h-7 rounded-md border border-[color:var(--color-rule)] text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-hover)] hover:text-[color:var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-accent)] cursor-pointer"
        >
          <BookOpen size={14} strokeWidth={1.75} />
        </button>
        <a
          href="https://github.com/javierdejesusda/praxis-agent"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View source on GitHub"
          title="View source on GitHub"
          className="flex items-center justify-center w-7 h-7 rounded-md border border-[color:var(--color-rule)] text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-hover)] hover:text-[color:var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-accent)]"
        >
          <GithubMark size={14} />
        </a>
        <div className="hidden lg:block">
          <LastUpdated iso={regime?.timestamp ?? null} />
        </div>
      </div>
    </header>
  );
}
