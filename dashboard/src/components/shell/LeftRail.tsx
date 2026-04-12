"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  Activity,
  LineChart,
  ShieldAlert,
  Stamp,
  FileText,
  BrainCircuit,
  X,
} from "lucide-react";
import { useEffect, useRef } from "react";

import { setMobileNavOpen, useMobileNavOpen } from "@/lib/mobile-nav";

const NAV = [
  { href: "/overview", label: "Overview", code: "OVR", icon: LayoutDashboard },
  { href: "/agents", label: "Agents", code: "AGT", icon: BrainCircuit },
  { href: "/positions", label: "Positions", code: "POS", icon: Briefcase },
  { href: "/signals", label: "Signals", code: "SIG", icon: Activity },
  { href: "/backtest", label: "Backtest", code: "BT", icon: LineChart },
  { href: "/risk", label: "Risk", code: "RSK", icon: ShieldAlert },
  { href: "/attestations", label: "Attestations", code: "ATT", icon: Stamp },
  { href: "/audit", label: "Audit", code: "AUD", icon: FileText },
] as const;

function NavList({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <ul className="px-3 space-y-1">
      {NAV.map((item) => {
        const active = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={`group flex items-center gap-3 px-3 py-2.5 text-[13px] cursor-pointer rounded-[10px] ${
                active
                  ? "bg-[color:var(--color-accent)] text-white font-medium shadow-[0_1px_3px_rgba(0,122,255,0.3)]"
                  : "text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-hover)]"
              }`}
            >
              <Icon
                size={16}
                strokeWidth={active ? 2 : 1.5}
                className={
                  active
                    ? ""
                    : "group-hover:scale-110 transition-transform duration-200"
                }
              />
              <span className="flex-1">{item.label}</span>
              <span
                className={`num text-[9px] ${
                  active
                    ? "text-white/60"
                    : "text-[color:var(--color-muted-soft)] group-hover:text-[color:var(--color-muted)]"
                }`}
              >
                {item.code}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function LeftRail() {
  const pathname = usePathname();
  const open = useMobileNavOpen();
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Close on ESC + prevent background scroll while drawer is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtnRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <nav
        aria-label="Primary"
        className="hidden md:block w-[220px] shrink-0 border-r border-[color:var(--color-rule)]"
        style={{
          background: "var(--color-surface)",
          backdropFilter: "saturate(180%) blur(20px)",
          WebkitBackdropFilter: "saturate(180%) blur(20px)",
        }}
      >
        <div className="px-4 pt-5 pb-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-muted-soft)] font-medium">
            Workstation
          </div>
        </div>
        <NavList pathname={pathname} />
      </nav>

      <div
        aria-hidden={!open}
        className={`md:hidden fixed inset-0 z-40 transition-opacity duration-200 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        style={{ background: "rgba(0,0,0,0.45)" }}
        onClick={() => setMobileNavOpen(false)}
      />

      <nav
        aria-label="Primary mobile"
        aria-hidden={!open}
        className={`md:hidden fixed top-0 left-0 bottom-0 z-50 w-[260px] max-w-[82vw] border-r border-[color:var(--color-rule)] flex flex-col transition-transform duration-250 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          background: "var(--color-surface-solid)",
          backdropFilter: "saturate(180%) blur(20px)",
          WebkitBackdropFilter: "saturate(180%) blur(20px)",
        }}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-[color:var(--color-rule)]">
          <div className="flex items-baseline gap-2">
            <span className="text-[18px] font-semibold tracking-[-0.03em] text-[color:var(--color-ink)]">
              Praxis
            </span>
            <span className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-muted)] font-medium">
              Trading
            </span>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
            className="flex items-center justify-center w-8 h-8 rounded-md border border-[color:var(--color-rule)] text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-accent)]"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        <div className="px-4 pt-5 pb-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-muted-soft)] font-medium">
            Workstation
          </div>
        </div>
        <div className="flex-1 overflow-y-auto pb-4">
          <NavList pathname={pathname} onNavigate={() => setMobileNavOpen(false)} />
        </div>
      </nav>
    </>
  );
}
