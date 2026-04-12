"use client";

import {Archive} from "lucide-react";
import {useRouter} from "next/navigation";
import {formatTimestamp, useTimezoneMode} from "@/lib/timezone";

interface SnapshotBannerProps {
  snapshot: string;
  currentGeneratedAt: string | null;
}

export function SnapshotBanner({
  snapshot,
  currentGeneratedAt,
}: SnapshotBannerProps) {
  const router = useRouter();
  const tzMode = useTimezoneMode();

  if (currentGeneratedAt && snapshot === currentGeneratedAt) {
    return null;
  }

  const readable = formatTimestamp(snapshot, tzMode);

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-6 flex items-center justify-between gap-4 rounded-2xl border px-5 py-3 backdrop-blur-xl backdrop-saturate-[1.8]"
      style={{
        background: "var(--color-surface)",
        borderColor: "var(--color-rule)",
        borderLeft: "4px solid var(--color-accent-soft)",
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="inline-flex h-8 w-8 items-center justify-center rounded-full shrink-0"
          style={{
            background: "var(--color-accent-soft)",
            color: "var(--color-accent)",
          }}
          aria-hidden="true"
        >
          <Archive size={16} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <div
            className="text-[11px] uppercase tracking-[0.12em] font-medium"
            style={{color: "var(--color-muted)"}}
          >
            Archived snapshot
          </div>
          <div
            className="text-[13px] truncate"
            style={{color: "var(--color-ink)"}}
          >
            Viewing archived snapshot &middot;{" "}
            <span
              className="tabular-nums"
              style={{color: "var(--color-ink-soft)"}}
            >
              {readable}
            </span>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => router.replace("/backtest")}
        aria-label="Return to live backtest report"
        className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 shrink-0"
        style={{
          background: "var(--color-surface)",
          color: "var(--color-ink-soft)",
          borderColor: "var(--color-rule)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--color-hover)";
          e.currentTarget.style.color = "var(--color-ink)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--color-surface)";
          e.currentTarget.style.color = "var(--color-ink-soft)";
        }}
        onFocus={(e) => {
          e.currentTarget.style.boxShadow =
            "0 0 0 2px var(--color-surface-solid), 0 0 0 4px var(--color-accent)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        Back to live
      </button>
    </div>
  );
}
