"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard error boundary]", error);
  }, [error]);

  return (
    <div
      role="alert"
      className="max-w-xl mx-auto my-16 rounded-2xl border border-[color:var(--color-rule-strong)] bg-[color:var(--color-bone)] p-8"
    >
      <div className="flex items-center gap-3 mb-4">
        <span
          className="inline-flex items-center justify-center rounded-full"
          style={{
            width: 40,
            height: 40,
            background: "var(--color-loss-soft)",
            color: "var(--color-loss)",
          }}
        >
          <AlertTriangle size={20} strokeWidth={2.5} />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--color-ink)]">
            This view hit an error
          </h2>
          <p className="text-xs text-[color:var(--color-muted)]">
            The rest of the dashboard is still live.
          </p>
        </div>
      </div>

      <pre
        className="font-mono text-xs p-3 mb-4 rounded-lg overflow-auto"
        style={{
          background: "rgba(0,0,0,0.04)",
          color: "var(--color-ink-soft)",
          maxHeight: 180,
        }}
      >
        {error.message}
        {error.digest ? `\n\ndigest: ${error.digest}` : ""}
      </pre>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
          style={{
            background: "var(--color-accent)",
            color: "#fff",
          }}
        >
          <RotateCcw size={14} strokeWidth={2.5} />
          Retry this view
        </button>
        <a
          href="/overview"
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium border border-[color:var(--color-rule-strong)] text-[color:var(--color-ink-soft)]"
        >
          Back to overview
        </a>
      </div>
    </div>
  );
}
