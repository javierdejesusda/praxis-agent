"use client";

import { fmtRelative } from "@/lib/format";
import { useNowMs } from "@/lib/now-store";

export function SectionHeader({
  title,
  count,
  rightSlot,
  updatedAt,
  staleAfterMs = 60_000,
  isLoading = false,
}: {
  title: string;
  count?: number;
  rightSlot?: React.ReactNode;
  updatedAt?: string | null;
  staleAfterMs?: number;
  isLoading?: boolean;
}) {
  const nowMs = useNowMs();

  let freshness: React.ReactNode = null;
  if (updatedAt && !isLoading) {
    const parsed = Date.parse(updatedAt);
    if (Number.isFinite(parsed)) {
      const age = nowMs - parsed;
      const label = fmtRelative(updatedAt, nowMs);
      const stale = age > staleAfterMs;
      freshness = stale ? (
        <span
          className="num text-[10px] px-1.5 py-0.5 rounded-full"
          style={{
            background: "var(--color-warn-soft)",
            color: "var(--color-warn)",
          }}
          title={`Data older than ${Math.round(staleAfterMs / 1000)}s`}
        >
          {label}
        </span>
      ) : (
        <span className="num text-[10px] text-[color:var(--color-muted)]">
          {label}
        </span>
      );
    }
  }

  const hasRight = rightSlot != null || freshness != null;

  return (
    <div className="flex items-baseline justify-between pb-2.5 mb-3.5 border-b border-[color:var(--color-rule)]">
      <div className="flex items-baseline gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-muted)]">
          {title}
        </h3>
        {count !== undefined && (
          <span className="num text-[10px] text-[color:var(--color-muted-soft)]">
            ({count})
          </span>
        )}
      </div>
      {hasRight && (
        <div className="flex items-center gap-2">
          {rightSlot}
          {freshness}
        </div>
      )}
    </div>
  );
}
