"use client";

import {useMemo, useRef, useState} from "react";
import {useVirtualizer} from "@tanstack/react-virtual";

import {CopyButton} from "@/components/ui/CopyButton";
import {EmptyState} from "@/components/ui/EmptyState";
import {NumericValue} from "@/components/ui/NumericValue";
import {SkeletonRow} from "@/components/ui/Skeleton";
import {StatusPill, type PillTone} from "@/components/ui/StatusPill";
import type {Artifact} from "@/lib/api";
import {formatTimestamp, useTimezoneMode} from "@/lib/timezone";

import {ArtifactDetailDrawer} from "./ArtifactDetailDrawer";
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
  const [selected, setSelected] = useState<Artifact | null>(null);
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

  const handleRowKey = (
    e: React.KeyboardEvent<HTMLTableRowElement>,
    artifact: Artifact,
  ) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelected(artifact);
    }
  };

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
      <>
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
                const isOpen = selected?.hash === row.artifact.hash;
                return (
                  <tr
                    key={row.artifact.hash}
                    tabIndex={0}
                    aria-expanded={isOpen}
                    aria-label={`Open artifact ${row.artifact.type} for ${row.pair}`}
                    onClick={() => setSelected(row.artifact)}
                    onKeyDown={(e) => handleRowKey(e, row.artifact)}
                    className="cursor-pointer focus-visible:outline-none focus-visible:bg-[color:var(--color-hover)] transition-colors duration-150"
                  >
                    <ArtifactRowCells row={row} tzMode={tzMode} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ArtifactDetailDrawer
          artifact={selected}
          onClose={() => setSelected(null)}
        />
      </>
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
    <>
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
              const isOpen = selected?.hash === row.artifact.hash;
              return (
                <tr
                  key={row.artifact.hash}
                  data-index={vItem.index}
                  ref={virtualizer.measureElement}
                  tabIndex={0}
                  aria-expanded={isOpen}
                  aria-label={`Open artifact ${row.artifact.type} for ${row.pair}`}
                  onClick={() => setSelected(row.artifact)}
                  onKeyDown={(e) => handleRowKey(e, row.artifact)}
                  className="cursor-pointer focus-visible:outline-none focus-visible:bg-[color:var(--color-hover)] transition-colors duration-150"
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
      <ArtifactDetailDrawer
        artifact={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
