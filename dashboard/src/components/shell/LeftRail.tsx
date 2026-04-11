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
} from "lucide-react";

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

export function LeftRail() {
  const pathname = usePathname();
  return (
    <nav
      className="w-[220px] shrink-0"
      style={{
        background: "rgba(255, 255, 255, 0.6)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
        borderRight: "1px solid rgba(0, 0, 0, 0.06)",
      }}
    >
      <div className="px-4 pt-5 pb-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-muted-soft)] font-medium">
          Workstation
        </div>
      </div>
      <ul className="px-3 space-y-1">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`group flex items-center gap-3 px-3 py-2.5 text-[13px] cursor-pointer rounded-[10px] ${
                  active
                    ? "bg-[color:var(--color-accent)] text-white font-medium shadow-[0_1px_3px_rgba(0,122,255,0.3)]"
                    : "text-[color:var(--color-ink-soft)] hover:bg-black/[0.04]"
                }`}
              >
                <Icon size={16} strokeWidth={active ? 2 : 1.5} className={active ? "" : "group-hover:scale-110 transition-transform duration-200"} />
                <span className="flex-1">{item.label}</span>
                <span className={`num text-[9px] ${active ? "text-white/60" : "text-[color:var(--color-muted-soft)] group-hover:text-[color:var(--color-muted)]"}`}>{item.code}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
