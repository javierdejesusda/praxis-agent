"use client";

import {X} from "lucide-react";

import type {Artifact} from "@/lib/api";

export type AuditFilters = {
  query: string;
  type: string | null;
  pair: string | null;
};

export const EMPTY_AUDIT_FILTERS: AuditFilters = {
  query: "",
  type: null,
  pair: null,
};

export function filterArtifacts(
  artifacts: Artifact[],
  filters: AuditFilters,
): Artifact[] {
  const query = filters.query.trim().toLowerCase();
  if (!query && !filters.type && !filters.pair) return artifacts;
  return artifacts.filter((artifact) => {
    if (filters.type && artifact.type !== filters.type) return false;
    const pair = artifact.payload?.pair ?? "";
    if (filters.pair && pair !== filters.pair) return false;
    if (!query) return true;
    if (artifact.hash.toLowerCase().includes(query)) return true;
    if (artifact.type.toLowerCase().includes(query)) return true;
    if (pair.toLowerCase().includes(query)) return true;
    const side =
      artifact.payload?.intent?.side ??
      artifact.payload?.risk_decision?.final_side ??
      "";
    if (side.toLowerCase().includes(query)) return true;
    return false;
  });
}

type AuditFilterBarProps = {
  value: AuditFilters;
  onChange: (next: AuditFilters) => void;
  typeOptions: string[];
  pairOptions: string[];
};

const INPUT_CLASS =
  "text-[12px] text-[color:var(--color-ink)] bg-[color:var(--color-surface)] border border-[color:var(--color-rule)] px-3 py-2 rounded-lg focus-visible:outline-none focus-visible:border-[color:var(--color-accent)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-soft)]";

export function AuditFilterBar({
  value,
  onChange,
  typeOptions,
  pairOptions,
}: AuditFilterBarProps) {
  const isDirty =
    value.query.trim().length > 0 ||
    value.type !== null ||
    value.pair !== null;

  const clear = () => onChange(EMPTY_AUDIT_FILTERS);

  return (
    <div className="flex flex-wrap items-center gap-3 px-5 pb-4">
      <input
        type="text"
        value={value.query}
        onChange={(e) => onChange({...value, query: e.target.value})}
        placeholder="Search hash, type, pair, side…"
        aria-label="Search artifacts"
        className={`${INPUT_CLASS} num w-72`}
        style={{fontFamily: "var(--font-mono)"}}
      />
      <label className="sr-only" htmlFor="audit-filter-type">
        Type
      </label>
      <select
        id="audit-filter-type"
        value={value.type ?? ""}
        onChange={(e) =>
          onChange({...value, type: e.target.value || null})
        }
        className={`${INPUT_CLASS} cursor-pointer uppercase tracking-[0.06em] text-[11px]`}
        style={{fontFamily: "var(--font-mono)"}}
      >
        <option value="">All types</option>
        {typeOptions.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="audit-filter-pair">
        Pair
      </label>
      <select
        id="audit-filter-pair"
        value={value.pair ?? ""}
        onChange={(e) =>
          onChange({...value, pair: e.target.value || null})
        }
        className={`${INPUT_CLASS} cursor-pointer uppercase tracking-[0.06em] text-[11px]`}
        style={{fontFamily: "var(--font-mono)"}}
      >
        <option value="">All pairs</option>
        {pairOptions.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      {isDirty && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear filters"
          className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.06em] text-[color:var(--color-muted)] hover:text-[color:var(--color-ink)] px-2 py-1 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-surface)]"
          style={{fontFamily: "var(--font-mono)"}}
        >
          <X size={12} strokeWidth={2} />
          Clear
        </button>
      )}
    </div>
  );
}
