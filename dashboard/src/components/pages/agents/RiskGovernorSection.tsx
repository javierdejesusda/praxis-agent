"use client";

import { useKillCriteria } from "@/lib/hooks";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusPill } from "@/components/ui/StatusPill";

const CRITERIA = [
  { key: "stale_data", label: "Data Freshness", threshold: "< 2 hours old", desc: "Market snapshot must be recent" },
  { key: "daily_loss_breached", label: "Daily Loss Cap", threshold: "< 3% equity", desc: "Halts trading if daily losses exceed cap" },
  { key: "max_drawdown_breached", label: "Max Drawdown", threshold: "< 8% from peak", desc: "Stops all activity if drawdown too deep" },
  { key: "spread_too_wide", label: "Spread Gate", threshold: "\u2264 20 bps", desc: "Rejects if bid-ask spread too wide" },
  { key: "malformed_output", label: "Output Integrity", threshold: "Valid schema", desc: "Verifies agent outputs conform to spec" },
  { key: "ledger_mismatch", label: "Ledger Match", threshold: "Internal \u2261 Exchange", desc: "Checks internal state matches Kraken" },
  { key: "kill_switch", label: "Kill Switch", threshold: "Operator override", desc: "Manual emergency halt" },
] as const;

export function RiskGovernorSection() {
  const { data } = useKillCriteria();

  return (
    <HairlineCard>
      <SectionHeader title="Risk Governor \u2014 Final Authority" />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6">
        <div className="space-y-3">
          <p className="text-[12px] text-[color:var(--color-muted)] leading-relaxed">
            Praxis{"'"}s risk governor is fully deterministic — the LLM can never override it.
            It enforces 7 kill criteria, validates signal consensus, sizes positions via Half-Kelly
            with a 1% risk cap, and sets ATR-based trailing stops and targets. A 3% daily loss cap
            and 8% max drawdown gate protect capital automatically.
          </p>
          <div>
            <div className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--color-muted)] font-medium mb-1">
              Two-Tier Scoring
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <StatusPill tone="ok" label="\u2265 85" dot={false} />
                <span className="text-[11px] text-[color:var(--color-ink-soft)]">ERC-8004 eligible (on-chain)</span>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill tone="info" label="\u2265 70" dot={false} />
                <span className="text-[11px] text-[color:var(--color-ink-soft)]">Paper trade only</span>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill tone="crit" label="< 70" dot={false} />
                <span className="text-[11px] text-[color:var(--color-ink-soft)]">Rejected</span>
              </div>
            </div>
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--color-muted)] font-medium mb-2">
            Kill Criteria Status
          </div>
          <div className="space-y-1">
            {CRITERIA.map((c) => {
              const tripped = data?.[c.key as keyof typeof data] === true;
              return (
                <div
                  key={c.key}
                  className={`flex items-center justify-between px-3 py-2 rounded-[10px] ${
                    tripped ? "bg-[color:var(--color-loss-soft)]" : "hover:bg-black/[0.02]"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-[color:var(--color-ink)] font-medium">{c.label}</div>
                    <div className="text-[10px] text-[color:var(--color-muted)]">{c.desc}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="num text-[10px] text-[color:var(--color-muted)]">{c.threshold}</span>
                    <StatusPill tone={tripped ? "crit" : "ok"} label={tripped ? "TRIP" : "OK"} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </HairlineCard>
  );
}
