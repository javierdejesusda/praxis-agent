"use client";

// Edge / cost / margin readout. These are strategy constants pulled from
// C:\Projects\AI-trading-agent\CLAUDE.md (55 bps round-trip cost, 82.5 bps
// edge floor, "edge 87 bps" is the current demo reading). Not a live value.
// When the backend exposes a margin hook, wire it here.

import { setHowItWorksOpen } from "@/components/how-it-works/how-it-works-store";

const EDGE_BPS = 87;
const COST_BPS = 55;
const MARGIN_BPS = EDGE_BPS - COST_BPS;

function marginColor(margin: number): string {
  if (margin > 5) return "var(--color-gain)";
  if (margin < -5) return "var(--color-loss)";
  return "var(--color-warn)";
}

export function CostWidget() {
  const marginVar = marginColor(MARGIN_BPS);
  const signed = `${MARGIN_BPS >= 0 ? "+" : ""}${MARGIN_BPS}`;
  return (
    <button
      type="button"
      onClick={() => setHowItWorksOpen(true)}
      aria-label="How Praxis Agent makes money — edge, cost, margin"
      title="Edge vs cost — click for details"
      className="hidden md:inline-flex items-center gap-2 rounded-full cursor-pointer focus-visible:outline focus-visible:outline-2 transition-colors duration-150"
      style={{
        padding: "5px 10px",
        background: "var(--color-surface)",
        border: "1px solid var(--color-rule)",
        outlineColor: "var(--color-accent)",
      }}
    >
      <span
        className="num text-[10px] font-medium uppercase tracking-[0.04em]"
        style={{ color: "var(--color-ink-soft)", fontVariantNumeric: "tabular-nums" }}
      >
        edge <span style={{ color: "var(--color-ink)" }}>{EDGE_BPS}</span> bps
      </span>
      <span
        style={{
          width: 1,
          height: 10,
          background: "var(--color-rule-strong)",
        }}
        aria-hidden="true"
      />
      <span
        className="num text-[10px] font-medium uppercase tracking-[0.04em]"
        style={{ color: "var(--color-ink-soft)", fontVariantNumeric: "tabular-nums" }}
      >
        cost <span style={{ color: "var(--color-ink)" }}>{COST_BPS}</span> bps
      </span>
      <span
        style={{
          width: 1,
          height: 10,
          background: "var(--color-rule-strong)",
        }}
        aria-hidden="true"
      />
      <span
        className="num text-[10px] font-semibold uppercase tracking-[0.04em]"
        style={{ color: marginVar, fontVariantNumeric: "tabular-nums" }}
      >
        margin {signed} bps
      </span>
    </button>
  );
}
