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
} from "lucide-react";

const NAV = [
  { href: "/overview", label: "Overview", code: "OVR", icon: LayoutDashboard },
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
    <nav className="w-[200px] shrink-0 border-r border-[color:var(--color-rule)] bg-[color:var(--color-bone)]">
      <div className="px-3 pt-4 pb-2">
        <div className="text-[9px] uppercase tracking-[0.2em] text-[color:var(--color-muted)]">
          Workstation
        </div>
      </div>
      <ul>
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 text-[12px] border-l-2 ${
                  active
                    ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] text-[color:var(--color-accent)]"
                    : "border-transparent text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-paper)]"
                }`}
              >
                <Icon size={14} strokeWidth={1.75} />
                <span className="flex-1">{item.label}</span>
                <span className="num text-[9px] text-[color:var(--color-muted-soft)]">{item.code}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
