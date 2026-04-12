"use client";

import {useMemo, useRef, useState} from "react";
import {ExternalLink} from "lucide-react";
import {useVirtualizer} from "@tanstack/react-virtual";

import {CopyButton} from "@/components/ui/CopyButton";
import {EmptyState} from "@/components/ui/EmptyState";
import {NumericValue} from "@/components/ui/NumericValue";
import {SkeletonRow} from "@/components/ui/Skeleton";
import {StatusPill, type PillTone} from "@/components/ui/StatusPill";
import type {Attestation} from "@/lib/api";
import {etherscanTx} from "@/lib/chain";
import {formatTimestamp, useTimezoneMode} from "@/lib/timezone";

type KindFilter = "all" | "validation" | "reputation" | "trade_intent";

const KIND_TONE: Record<Attestation["kind"], PillTone> = {
  validation: "info",
  reputation: "warn",
  trade_intent: "neutral",
};

const VIRTUALIZE_THRESHOLD = 50;
const ROW_HEIGHT = 44;
const VIRTUAL_LIST_HEIGHT = 560;
const COLUMN_COUNT = 8;

type AttestationsTableProps = {
  records: Attestation[];
  isLoading?: boolean;
};

function truncate(text: string, max = 40): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function AttestationRowCells({
  record,
  tzMode,
}: {
  record: Attestation;
  tzMode: ReturnType<typeof useTimezoneMode>;
}) {
  return (
    <>
      <td>
        <StatusPill
          tone={KIND_TONE[record.kind]}
          label={record.kind.toUpperCase()}
        />
      </td>
      <td>
        <span className="num text-[11px] text-[color:var(--color-ink-soft)]">
          {formatTimestamp(record.timestamp, tzMode)}
        </span>
      </td>
      <td>
        <span className="num text-[color:var(--color-ink)]">
          {record.pair || "—"}
        </span>
      </td>
      <td>
        <span className="uppercase tracking-[0.06em] text-[11px] text-[color:var(--color-ink-soft)]">
          {record.artifact_type || "—"}
        </span>
      </td>
      <td className="num">
        {record.score != null ? (
          <NumericValue value={record.score} kind="int" />
        ) : (
          <span className="text-[color:var(--color-muted)]">—</span>
        )}
      </td>
      <td>
        <span
          className="text-[11px] text-[color:var(--color-ink-soft)] block overflow-hidden text-ellipsis whitespace-nowrap"
          style={{maxWidth: 260}}
          title={record.comment ?? ""}
        >
          {record.comment ? truncate(record.comment, 40) : "—"}
        </span>
      </td>
      <td>
        <CopyButton value={record.artifact_hash} truncate={10} />
      </td>
      <td>
        <div className="inline-flex items-center gap-1.5">
          <CopyButton value={record.tx_hash} truncate={10} />
          <a
            href={etherscanTx(record.tx_hash)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View on Etherscan"
            className="inline-flex items-center justify-center text-[color:var(--color-muted)] hover:text-[color:var(--color-accent)]"
            style={{padding: 2, borderRadius: 4}}
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink size={12} strokeWidth={2} />
          </a>
        </div>
      </td>
    </>
  );
}

function TableHeader() {
  return (
    <thead
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1,
        background: "var(--color-surface-solid)",
      }}
    >
      <tr>
        <th>Kind</th>
        <th>Time</th>
        <th>Pair</th>
        <th>Artifact Type</th>
        <th className="num">Score</th>
        <th>Comment</th>
        <th>Artifact Hash</th>
        <th>Tx</th>
      </tr>
    </thead>
  );
}

export function AttestationsTable({
  records,
  isLoading = false,
}: AttestationsTableProps) {
  const tzMode = useTimezoneMode();
  const [kind, setKind] = useState<KindFilter>("all");
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => (kind === "all" ? records : records.filter((r) => r.kind === kind)),
    [records, kind],
  );
  const shouldVirtualize = filtered.length > VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? filtered.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  return (
    <div>
      <div className="flex items-center gap-3 px-5 pb-3">
        <label
          htmlFor="attestations-kind-filter"
          className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--color-muted)] font-medium"
          style={{fontFamily: "var(--font-mono)"}}
        >
          Kind
        </label>
        <select
          id="attestations-kind-filter"
          value={kind}
          onChange={(e) => setKind(e.target.value as KindFilter)}
          className="text-[11px] uppercase tracking-[0.06em] text-[color:var(--color-ink)] bg-[color:var(--color-surface)] border border-[color:var(--color-rule)] px-3 py-1.5 rounded-lg cursor-pointer focus-visible:outline-none focus-visible:border-[color:var(--color-accent)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]"
          style={{fontFamily: "var(--font-mono)"}}
        >
          <option value="all">All</option>
          <option value="validation">Validation</option>
          <option value="reputation">Reputation</option>
          <option value="trade_intent">Trade Intent</option>
        </select>
        <span className="num text-[10px] text-[color:var(--color-muted-soft)] ml-auto font-medium">
          {filtered.length} / {records.length}
        </span>
      </div>

      {isLoading ? (
        <div className="overflow-x-auto">
          <table className="data-table">
            <TableHeader />
            <tbody>
              {Array.from({length: 6}).map((_, i) => (
                <SkeletonRow key={i} cols={COLUMN_COUNT} />
              ))}
            </tbody>
          </table>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          label="No attestations"
          sub={
            kind === "all"
              ? "Attestations will appear here once the agent anchors on Sepolia."
              : `No ${kind.replace("_", " ")} records yet.`
          }
        />
      ) : !shouldVirtualize ? (
        <div className="overflow-x-auto">
          <table className="data-table">
            <TableHeader />
            <tbody>
              {filtered.map((record) => (
                <tr key={record.tx_hash}>
                  <AttestationRowCells record={record} tzMode={tzMode} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="overflow-auto"
          style={{maxHeight: VIRTUAL_LIST_HEIGHT}}
        >
          <table className="data-table">
            <TableHeader />
            <tbody>
              {(() => {
                const virtualItems = virtualizer.getVirtualItems();
                const totalSize = virtualizer.getTotalSize();
                const paddingTop =
                  virtualItems.length > 0 ? virtualItems[0].start : 0;
                const paddingBottom =
                  virtualItems.length > 0
                    ? totalSize - virtualItems[virtualItems.length - 1].end
                    : 0;
                return (
                  <>
                    {paddingTop > 0 && (
                      <tr aria-hidden="true">
                        <td
                          colSpan={COLUMN_COUNT}
                          style={{height: paddingTop, padding: 0}}
                        />
                      </tr>
                    )}
                    {virtualItems.map((vItem) => {
                      const record = filtered[vItem.index];
                      return (
                        <tr
                          key={record.tx_hash}
                          data-index={vItem.index}
                          ref={virtualizer.measureElement}
                        >
                          <AttestationRowCells
                            record={record}
                            tzMode={tzMode}
                          />
                        </tr>
                      );
                    })}
                    {paddingBottom > 0 && (
                      <tr aria-hidden="true">
                        <td
                          colSpan={COLUMN_COUNT}
                          style={{height: paddingBottom, padding: 0}}
                        />
                      </tr>
                    )}
                  </>
                );
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
