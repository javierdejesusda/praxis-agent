"use client";

import { Fragment, useMemo, useState } from "react";

import { KeyValueGrid } from "@/components/ui/KeyValueGrid";
import { NumericValue } from "@/components/ui/NumericValue";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";
import { fmtHashShort, fmtTimestamp } from "@/lib/format";
import { useArtifacts } from "@/lib/hooks";
import type { Artifact } from "@/lib/api";

type Column = {
  id: string;
  header: string;
  align?: "left" | "right";
  width?: string;
};

const COLUMNS: Column[] = [
  { id: "type", header: "Type" },
  { id: "time", header: "Time" },
  { id: "pair", header: "Pair" },
  { id: "side", header: "Side" },
  { id: "size", header: "Size USD", align: "right" },
  { id: "hash", header: "Hash" },
];

function typeTone(type: string): PillTone {
  if (type === "trade-execution") return "ok";
  if (type === "no-trade") return "crit";
  return "neutral";
}

function ExpansionDetail({ artifact }: { artifact: Artifact }) {
  const payload = artifact.payload ?? {};
  const analyst = payload.analyst;
  const risk = payload.risk_decision;
  const receipt = payload.receipt;
  const source = (payload as { source?: string }).source;

  const items: Array<{ k: string; v: React.ReactNode }> = [
    { k: "Source", v: source ?? "—" },
    { k: "Analyst Direction", v: analyst?.direction?.toUpperCase() ?? "—" },
    {
      k: "Analyst Conviction",
      v:
        analyst && typeof analyst.conviction === "number" ? (
          <NumericValue value={analyst.conviction} kind="int" />
        ) : (
          "—"
        ),
    },
    { k: "Regime Assessment", v: analyst?.regime_assessment ?? "—" },
    { k: "Risk Approved", v: risk?.approved ? "YES" : "NO" },
    {
      k: "Reason Codes",
      v: risk?.reason_codes && risk.reason_codes.length > 0 ? risk.reason_codes.join(", ") : "—",
    },
    {
      k: "Final Size USD",
      v: <NumericValue value={risk?.final_size_usd ?? 0} kind="usd" />,
    },
    {
      k: "Fill Price",
      v: <NumericValue value={receipt?.fill_price ?? 0} kind="usd" />,
    },
    { k: "Order Status", v: receipt?.status ?? "—" },
    { k: "Order ID", v: receipt?.order_id ?? "—" },
  ];

  return (
    <div className="space-y-3 px-3 py-4 bg-[color:var(--color-bone)]">
      <KeyValueGrid columns={2} items={items} />
      <pre className="text-[10px] font-mono bg-[color:var(--color-paper)] p-3 border border-[color:var(--color-rule)] max-h-80 overflow-auto whitespace-pre-wrap">
        {JSON.stringify(artifact, null, 2)}
      </pre>
    </div>
  );
}

export function ArtifactsTable() {
  const { data } = useArtifacts(100);
  const artifacts = useMemo(() => data ?? [], [data]);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return artifacts;
    return artifacts.filter((a) => a.hash.toLowerCase().startsWith(q));
  }, [artifacts, query]);

  const toggle = (hash: string) => {
    setExpanded((prev) => (prev === hash ? null : hash));
  };

  return (
    <div>
      <div className="flex items-center gap-3 px-4 pb-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by hash prefix…"
          className="num text-[12px] bg-[color:var(--color-paper)] border border-[color:var(--color-rule)] px-2 py-1 w-72 focus:outline-none focus:border-[color:var(--color-accent)]"
          style={{ borderRadius: 2 }}
        />
        <span className="text-[10px] uppercase tracking-[0.06em] text-[color:var(--color-muted)]">
          {filtered.length} / {artifacts.length} artifacts
        </span>
      </div>
      {filtered.length === 0 ? (
        <div className="py-10 text-center text-[12px] text-[color:var(--color-muted)]">
          No artifacts match.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.id} className={c.align === "right" ? "num" : ""}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((artifact) => {
                const payload = artifact.payload ?? {};
                const side =
                  payload.intent?.side ??
                  (payload.risk_decision as { final_side?: string } | undefined)?.final_side ??
                  "—";
                const pair = payload.pair ?? "—";
                const sizeUsd = payload.intent?.size_usd ?? 0;
                const isOpen = expanded === artifact.hash;
                return (
                  <Fragment key={artifact.hash}>
                    <tr
                      onClick={() => toggle(artifact.hash)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>
                        <StatusPill
                          tone={typeTone(artifact.type)}
                          label={artifact.type.toUpperCase()}
                        />
                      </td>
                      <td>
                        <span className="num text-[11px] text-[color:var(--color-muted)]">
                          {fmtTimestamp(artifact.timestamp)}
                        </span>
                      </td>
                      <td>
                        <span className="num text-[color:var(--color-ink)]">{pair}</span>
                      </td>
                      <td>
                        <span className="num text-[11px]">{side.toUpperCase()}</span>
                      </td>
                      <td className="num">
                        <NumericValue value={sizeUsd} kind="usd" />
                      </td>
                      <td>
                        <span className="num text-[11px]">{fmtHashShort(artifact.hash)}</span>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={COLUMNS.length} style={{ padding: 0 }}>
                          <ExpansionDetail artifact={artifact} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
