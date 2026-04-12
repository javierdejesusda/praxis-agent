"use client";

import { useLatestSignals } from "@/lib/hooks";
import type { Signal } from "@/lib/api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";
import { NumericValue } from "@/components/ui/NumericValue";
import { Skeleton } from "@/components/ui/Skeleton";

function directionTone(direction: string): PillTone {
  const d = direction?.toLowerCase();
  if (d === "long") return "ok";
  if (d === "short") return "crit";
  return "neutral";
}

function formatEvidence(evidence: Record<string, unknown>): string {
  const entries = Object.entries(evidence ?? {}).slice(0, 3);
  if (entries.length === 0) return "\u2014";
  return entries
    .map(([k, v]) => {
      let rendered: string;
      if (v === null || v === undefined) {
        rendered = "\u2014";
      } else if (typeof v === "number") {
        rendered = Number.isInteger(v) ? v.toString() : v.toFixed(2);
      } else if (typeof v === "string") {
        rendered = v.length > 14 ? `${v.slice(0, 13)}\u2026` : v;
      } else {
        const s = JSON.stringify(v);
        rendered = s.length > 14 ? `${s.slice(0, 13)}\u2026` : s;
      }
      return `${k}: ${rendered}`;
    })
    .join(", ");
}

const columns: Column<Signal>[] = [
  {
    id: "agent",
    header: "Agent",
    accessor: (s) => (
      <span className="text-[12px] text-[color:var(--color-ink)]">
        {s.agent_name}
      </span>
    ),
  },
  {
    id: "pair",
    header: "Pair",
    accessor: (s) => (
      <span className="num text-[12px] text-[color:var(--color-ink)]">
        {s.pair}
      </span>
    ),
  },
  {
    id: "direction",
    header: "Direction",
    accessor: (s) => (
      <StatusPill
        tone={directionTone(s.direction)}
        label={(s.direction || "hold").toUpperCase()}
      />
    ),
  },
  {
    id: "confidence",
    header: "Confidence",
    align: "right",
    accessor: (s) => <NumericValue value={s.confidence} kind="int" />,
  },
  {
    id: "evidence",
    header: "Evidence",
    accessor: (s) => (
      <span className="text-[11px] text-[color:var(--color-muted)] truncate max-w-[420px] inline-block align-middle">
        {formatEvidence(s.evidence)}
      </span>
    ),
  },
];

export function SignalGrid() {
  const { data, isLoading } = useLatestSignals();

  if (isLoading) {
    return (
      <div className="px-5 pb-4 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-2">
            <Skeleton width={120} height={12} />
            <Skeleton width={80} height={12} />
            <Skeleton width={56} height={18} radius={9} />
            <Skeleton width={40} height={12} />
            <Skeleton width={260} height={12} />
          </div>
        ))}
      </div>
    );
  }

  const rows = data?.signals ?? [];
  return (
    <DataTable<Signal>
      rows={rows}
      columns={columns}
      rowKey={(s) => `${s.agent_name}:${s.pair}:${s.direction}`}
      emptyLabel="No signals in last cycle."
    />
  );
}
