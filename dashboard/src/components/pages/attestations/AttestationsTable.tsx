"use client";

import { useMemo, useState } from "react";

import { DataTable, type Column } from "@/components/ui/DataTable";
import { NumericValue } from "@/components/ui/NumericValue";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";
import type { Attestation } from "@/lib/api";
import { fmtHashShort, fmtTimestamp } from "@/lib/format";
import { useAttestations } from "@/lib/hooks";

type KindFilter = "all" | "validation" | "reputation" | "trade_intent";

const KIND_TONE: Record<Attestation["kind"], PillTone> = {
  validation: "info",
  reputation: "neutral",
  trade_intent: "ok",
};

const ETHERSCAN_TX = "https://sepolia.etherscan.io/tx/";

function truncate(text: string, max = 40): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function AttestationsTable() {
  const { data } = useAttestations();
  const [kind, setKind] = useState<KindFilter>("all");

  const records = useMemo(() => data?.records ?? [], [data?.records]);
  const filtered = useMemo(
    () => (kind === "all" ? records : records.filter((r) => r.kind === kind)),
    [records, kind],
  );

  const columns: Column<Attestation>[] = [
    {
      id: "kind",
      header: "Kind",
      accessor: (r) => (
        <StatusPill tone={KIND_TONE[r.kind]} label={r.kind.toUpperCase()} />
      ),
    },
    {
      id: "time",
      header: "Time",
      accessor: (r) => (
        <span className="num text-[11px] text-[color:var(--color-ink-soft)]">
          {fmtTimestamp(r.timestamp)}
        </span>
      ),
    },
    {
      id: "pair",
      header: "Pair",
      accessor: (r) => (
        <span className="num text-[color:var(--color-ink)]">{r.pair || "—"}</span>
      ),
    },
    {
      id: "artifact_type",
      header: "Artifact Type",
      accessor: (r) => (
        <span className="uppercase tracking-[0.06em] text-[11px] text-[color:var(--color-ink-soft)]">
          {r.artifact_type || "—"}
        </span>
      ),
    },
    {
      id: "score",
      header: "Score",
      align: "right",
      accessor: (r) =>
        r.score != null ? (
          <NumericValue value={r.score} kind="int" />
        ) : (
          <span className="text-[color:var(--color-muted)]">—</span>
        ),
    },
    {
      id: "comment",
      header: "Comment",
      accessor: (r) => (
        <span
          className="text-[11px] text-[color:var(--color-ink-soft)] block overflow-hidden text-ellipsis whitespace-nowrap"
          style={{ maxWidth: 280 }}
          title={r.comment ?? ""}
        >
          {r.comment ? truncate(r.comment, 40) : "—"}
        </span>
      ),
    },
    {
      id: "tx",
      header: "Tx",
      accessor: (r) => (
        <a
          href={`${ETHERSCAN_TX}${r.tx_hash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="num text-[11px] text-[color:var(--color-accent)] hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {fmtHashShort(r.tx_hash)}
        </a>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center gap-2 px-4 pb-2">
        <label
          htmlFor="attestations-kind-filter"
          className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--color-muted)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          Kind
        </label>
        <select
          id="attestations-kind-filter"
          value={kind}
          onChange={(e) => setKind(e.target.value as KindFilter)}
          className="text-[11px] uppercase tracking-[0.06em] text-[color:var(--color-ink)] bg-[color:var(--color-bone)] border border-[color:var(--color-rule-strong)] px-2 py-1 focus:outline-none focus:border-[color:var(--color-accent)]"
          style={{ borderRadius: 2, fontFamily: "var(--font-mono)" }}
        >
          <option value="all">All</option>
          <option value="validation">Validation</option>
          <option value="reputation">Reputation</option>
          <option value="trade_intent">Trade Intent</option>
        </select>
        <span className="num text-[10px] text-[color:var(--color-muted-soft)] ml-auto">
          {filtered.length} / {records.length}
        </span>
      </div>
      <DataTable<Attestation>
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.tx_hash}
        emptyLabel="No attestations"
      />
    </div>
  );
}
