"use client";

import { memo, useMemo, useState } from "react";
import { ArrowUpRight, ArrowDownRight, ChevronLeft, ChevronRight } from "lucide-react";

import { useTrades } from "@/lib/hooks";
import type { Artifact } from "@/lib/api";
import { NumericValue } from "@/components/ui/NumericValue";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";
import { CopyButton } from "@/components/ui/CopyButton";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { formatTimestamp, useTimezoneMode } from "@/lib/timezone";
import { shortHash } from "@/lib/chain";

const PAGE_SIZE = 25;

type TradesTableProps = {
  onSelect?: (artifact: Artifact) => void;
  selectedKey?: string | null;
};

function sideTone(side: string | undefined): PillTone {
  const s = (side || "").toLowerCase();
  if (s === "long" || s === "buy") return "ok";
  if (s === "short" || s === "sell") return "crit";
  return "neutral";
}

function statusTone(status: string | undefined): PillTone {
  const s = (status || "").toLowerCase();
  if (s === "filled" || s === "approved") return "ok";
  if (s === "rejected" || s === "failed") return "crit";
  if (s === "pending") return "warn";
  return "neutral";
}

function isCloseArtifact(artifact: Artifact): boolean {
  return artifact.type === "position-close";
}

function TypeBadge({ isClose }: { isClose: boolean }) {
  if (isClose) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-[0.06em]"
        style={{
          background: "var(--color-warn-soft)",
          color: "var(--color-warn)",
          border: "1px solid var(--color-warn)",
        }}
      >
        <ArrowDownRight size={12} strokeWidth={2.5} />
        EXIT
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-[0.06em]"
      style={{
        background: "var(--color-accent-soft)",
        color: "var(--color-accent)",
        border: "1px solid var(--color-accent)",
      }}
    >
      <ArrowUpRight size={12} strokeWidth={2.5} />
      ENTRY
    </span>
  );
}

function TradesTableImpl({ onSelect, selectedKey }: TradesTableProps) {
  const { data: trades, isLoading } = useTrades();
  const [pageIndex, setPageIndex] = useState(0);
  const tzMode = useTimezoneMode();

  const rows = useMemo(() => trades ?? [], [trades]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(pageIndex, totalPages - 1);
  const pageRows = useMemo(
    () => rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [rows, safePage],
  );

  if (isLoading && rows.length === 0) {
    return (
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Time</th>
              <th>Pair</th>
              <th>Side</th>
              <th className="num">Size USD</th>
              <th className="num">Price</th>
              <th>Status</th>
              <th>Hash</th>
              <th aria-hidden="true" style={{ width: 28 }} />
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} cols={9} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-[13px] text-[color:var(--color-muted)]">
        No trades recorded.
      </div>
    );
  }

  const handleActivate = (artifact: Artifact) => {
    if (onSelect) onSelect(artifact);
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Time</th>
              <th>Pair</th>
              <th>Side</th>
              <th className="num">Size USD</th>
              <th className="num">Price</th>
              <th>Status</th>
              <th>Hash</th>
              <th aria-hidden="true" style={{ width: 28 }} />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((artifact, idx) => {
              const key = artifact.hash || `${artifact.timestamp}-${idx}`;
              const payload = artifact.payload;
              const isClose = isCloseArtifact(artifact);
              const p = payload as Record<string, unknown>;

              const pair = isClose
                ? (p.pair as string) || "\u2014"
                : payload.pair || payload.intent?.pair || "\u2014";

              const side = isClose
                ? (p.side as string | undefined)
                : payload.intent?.side;

              const size = isClose
                ? (p.size_usd as number | undefined)
                : payload.intent?.size_usd;

              const price = isClose
                ? (p.exit_price as number | undefined)
                : payload.receipt?.fill_price;

              const status = isClose ? "closed" : payload.receipt?.status;
              const pnlUsd = isClose
                ? (p.pnl_usd as number | undefined)
                : undefined;

              const isSelected = selectedKey === key;
              const rowBg = isSelected
                ? "var(--color-hover)"
                : "transparent";
              const borderLeft = isClose
                ? "3px solid var(--color-warn)"
                : "3px solid var(--color-accent)";

              return (
                <tr
                  key={key}
                  onClick={() => handleActivate(artifact)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleActivate(artifact);
                    }
                  }}
                  tabIndex={0}
                  aria-label={`Open detail for ${pair} trade`}
                  className="cursor-pointer outline-none focus-visible:ring-2 trade-row"
                  style={{
                    background: rowBg,
                    transition: "background 150ms ease, box-shadow 150ms ease",
                  }}
                >
                  <td style={{ borderLeft, paddingLeft: 12 }}>
                    <TypeBadge isClose={isClose} />
                  </td>
                  <td>
                    <span className="num text-[12px] text-[color:var(--color-ink)]">
                      {formatTimestamp(artifact.timestamp, tzMode)}
                    </span>
                  </td>
                  <td>
                    <span className="num font-medium text-[13px] text-[color:var(--color-ink)]">
                      {pair}
                    </span>
                  </td>
                  <td>
                    {side ? (
                      <StatusPill tone={sideTone(side)} label={side.toUpperCase()} />
                    ) : (
                      <span className="text-[color:var(--color-muted)]">{"\u2014"}</span>
                    )}
                  </td>
                  <td className="num">
                    {size != null ? (
                      <NumericValue value={size} kind="usd" />
                    ) : (
                      <span className="text-[color:var(--color-muted)]">{"\u2014"}</span>
                    )}
                  </td>
                  <td className="num">
                    {price != null ? (
                      <NumericValue value={price} kind="usd" />
                    ) : (
                      <span className="text-[color:var(--color-muted)]">{"\u2014"}</span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      {status ? (
                        <StatusPill
                          tone={isClose ? "warn" : statusTone(status)}
                          label={status.toUpperCase()}
                        />
                      ) : (
                        <span className="text-[color:var(--color-muted)]">{"\u2014"}</span>
                      )}
                      {pnlUsd != null && (
                        <NumericValue
                          value={pnlUsd}
                          kind="usd"
                          color="auto"
                          sign="always"
                          className="text-[13px] font-semibold"
                        />
                      )}
                    </div>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {artifact.hash ? (
                      <CopyButton
                        value={artifact.hash}
                        label={shortHash(artifact.hash, 6, 4)}
                      />
                    ) : (
                      <span className="text-[color:var(--color-muted)]">{"\u2014"}</span>
                    )}
                  </td>
                  <td
                    aria-hidden="true"
                    style={{ color: "var(--color-muted-soft)" }}
                  >
                    <ChevronRight size={14} strokeWidth={2} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <style jsx>{`
        .trade-row:hover {
          background: var(--color-hover) !important;
          box-shadow: inset 0 0 0 1px var(--color-rule-strong);
        }
      `}</style>

      {rows.length > PAGE_SIZE && (
        <div
          className="flex items-center justify-between text-[11px]"
          style={{
            padding: "10px 16px",
            borderTop: "1px solid var(--color-rule)",
            color: "var(--color-muted)",
          }}
        >
          <span>
            Showing{" "}
            <span
              className="num"
              style={{ color: "var(--color-ink-soft)" }}
            >
              {safePage * PAGE_SIZE + 1}–
              {Math.min((safePage + 1) * PAGE_SIZE, rows.length)}
            </span>{" "}
            of{" "}
            <span
              className="num"
              style={{ color: "var(--color-ink-soft)" }}
            >
              {rows.length}
            </span>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              aria-label="Previous page"
              className="inline-flex items-center gap-1 rounded-md disabled:opacity-40"
              style={{
                padding: "4px 8px",
                border: "1px solid var(--color-rule)",
                color: "var(--color-ink-soft)",
                background: "transparent",
                cursor: safePage === 0 ? "not-allowed" : "pointer",
              }}
            >
              <ChevronLeft size={12} />
              Prev
            </button>
            <span
              className="num"
              style={{ color: "var(--color-ink-soft)" }}
            >
              {safePage + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() =>
                setPageIndex((p) => Math.min(totalPages - 1, p + 1))
              }
              disabled={safePage >= totalPages - 1}
              aria-label="Next page"
              className="inline-flex items-center gap-1 rounded-md disabled:opacity-40"
              style={{
                padding: "4px 8px",
                border: "1px solid var(--color-rule)",
                color: "var(--color-ink-soft)",
                background: "transparent",
                cursor:
                  safePage >= totalPages - 1 ? "not-allowed" : "pointer",
              }}
            >
              Next
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export const TradesTable = memo(TradesTableImpl);
