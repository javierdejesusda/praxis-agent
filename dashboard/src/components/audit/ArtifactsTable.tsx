"use client";

import {Fragment, useMemo, useRef, useState} from "react";
import {useVirtualizer} from "@tanstack/react-virtual";

import {CopyButton} from "@/components/ui/CopyButton";
import {EmptyState} from "@/components/ui/EmptyState";
import {KeyValueGrid} from "@/components/ui/KeyValueGrid";
import {NumericValue} from "@/components/ui/NumericValue";
import {SkeletonRow} from "@/components/ui/Skeleton";
import {StatusPill, type PillTone} from "@/components/ui/StatusPill";
import type {Artifact} from "@/lib/api";
import {formatTimestamp, useTimezoneMode} from "@/lib/timezone";

import {
  EMPTY_AUDIT_FILTERS,
  filterArtifacts,
  type AuditFilters,
} from "./AuditFilterBar";

const VIRTUALIZE_THRESHOLD = 50;
const ROW_HEIGHT = 48;
const VIRTUAL_LIST_HEIGHT = 560;
const COLUMN_COUNT = 6;

type ArtifactsTableProps = {
  artifacts: Artifact[];
  isLoading?: boolean;
  filters?: AuditFilters;
};

function typeTone(type: string): PillTone {
  if (type === "trade-execution") return "ok";
  if (type === "no-trade") return "crit";
  return "neutral";
}

function ExpansionDetail({artifact}: {artifact: Artifact}) {
  const payload = artifact.payload ?? {};
  const analyst = payload.analyst;
  const risk = payload.risk_decision;
  const receipt = payload.receipt;
  const source = payload.source;

  const items: Array<{k: string; v: React.ReactNode}> = [
    {k: "Source", v: source ?? "—"},
    {k: "Analyst Direction", v: analyst?.direction?.toUpperCase() ?? "—"},
    {
      k: "Analyst Conviction",
      v:
        analyst && typeof analyst.conviction === "number" ? (
          <NumericValue value={analyst.conviction} kind="int" />
        ) : (
          "—"
        ),
    },
    {k: "Regime Assessment", v: analyst?.regime_assessment ?? "—"},
    {k: "Risk Approved", v: risk?.approved ? "YES" : "NO"},
    {
      k: "Reason Codes",
      v:
        risk?.reason_codes && risk.reason_codes.length > 0
          ? risk.reason_codes.join(", ")
          : "—",
    },
    {
      k: "Final Size USD",
      v: <NumericValue value={risk?.final_size_usd ?? 0} kind="usd" />,
    },
    {
      k: "Fill Price",
      v: <NumericValue value={receipt?.fill_price ?? 0} kind="usd" />,
    },
    {k: "Order Status", v: receipt?.status ?? "—"},
    {k: "Order ID", v: receipt?.order_id ?? "—"},
  ];

  return (
    <div className="space-y-3 px-4 py-5 bg-[color:var(--color-paper)]">
      <KeyValueGrid columns={2} items={items} />
      <pre className="text-[10px] font-mono bg-[color:var(--color-surface-solid)] text-[color:var(--color-ink)] p-4 border border-[color:var(--color-rule)] max-h-80 overflow-auto whitespace-pre-wrap rounded-lg">
        {JSON.stringify(artifact, null, 2)}
      </pre>
    </div>
  );
}

type RowData = {
  artifact: Artifact;
  pair: string;
  side: string;
  sizeUsd: number;
};

function rowFrom(artifact: Artifact): RowData {
  const payload = artifact.payload ?? {};
  const side =
    payload.intent?.side ?? payload.risk_decision?.final_side ?? "—";
  return {
    artifact,
    pair: payload.pair ?? "—",
    side,
    sizeUsd: payload.intent?.size_usd ?? 0,
  };
}

function ArtifactRowCells({
  row,
  tzMode,
}: {
  row: RowData;
  tzMode: ReturnType<typeof useTimezoneMode>;
}) {
  const {artifact, pair, side, sizeUsd} = row;
  return (
    <>
      <td>
        <StatusPill
          tone={typeTone(artifact.type)}
          label={artifact.type.toUpperCase()}
        />
      </td>
      <td>
        <span className="num text-[11px] text-[color:var(--color-muted)]">
          {formatTimestamp(artifact.timestamp, tzMode)}
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
        <CopyButton value={artifact.hash} truncate={12} />
      </td>
    </>
  );
}

export function ArtifactsTable({
  artifacts,
  isLoading = false,
  filters = EMPTY_AUDIT_FILTERS,
}: ArtifactsTableProps) {
  const tzMode = useTimezoneMode();
  const [expanded, setExpanded] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => filterArtifacts(artifacts, filters),
    [artifacts, filters],
  );
  const rows = useMemo(() => filtered.map(rowFrom), [filtered]);
  const shouldVirtualize = rows.length > VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  const toggle = (hash: string) =>
    setExpanded((prev) => (prev === hash ? null : hash));

  if (isLoading) {
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
              <th>Hash</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({length: 6}).map((_, i) => (
              <SkeletonRow key={i} cols={COLUMN_COUNT} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        label="No artifacts"
        sub="Adjust filters or wait for the next decision cycle."
      />
    );
  }

  if (!shouldVirtualize) {
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
              <th>Hash</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isOpen = expanded === row.artifact.hash;
              return (
                <Fragment key={row.artifact.hash}>
                  <tr
                    onClick={() => toggle(row.artifact.hash)}
                    className="cursor-pointer"
                  >
                    <ArtifactRowCells row={row} tzMode={tzMode} />
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={COLUMN_COUNT} style={{padding: 0}}>
                        <ExpansionDetail artifact={row.artifact} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? totalSize - virtualItems[virtualItems.length - 1].end
      : 0;

  return (
    <div
      ref={scrollRef}
      className="overflow-auto"
      style={{maxHeight: VIRTUAL_LIST_HEIGHT}}
    >
      <table className="data-table">
        <thead
          style={{
            position: "sticky",
            top: 0,
            zIndex: 1,
            background: "var(--color-surface-solid)",
          }}
        >
          <tr>
            <th>Type</th>
            <th>Time</th>
            <th>Pair</th>
            <th>Side</th>
            <th className="num">Size USD</th>
            <th>Hash</th>
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr aria-hidden="true">
              <td
                colSpan={COLUMN_COUNT}
                style={{height: paddingTop, padding: 0}}
              />
            </tr>
          )}
          {virtualItems.map((vItem) => {
            const row = rows[vItem.index];
            return (
              <tr
                key={row.artifact.hash}
                data-index={vItem.index}
                ref={virtualizer.measureElement}
              >
                <ArtifactRowCells row={row} tzMode={tzMode} />
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
        </tbody>
      </table>
    </div>
  );
}
