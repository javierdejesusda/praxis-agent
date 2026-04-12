"use client";

import {Download, Share2} from "lucide-react";
import {toast} from "sonner";
import {useBacktestReport} from "@/lib/hooks";

const BUTTON_BASE_CLASSES =
  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 " +
  "text-[11px] font-medium uppercase tracking-[0.08em] transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function slugifyTimestamp(value: string | undefined): string {
  if (!value) return String(Date.now());
  return value.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function BacktestExportBar() {
  const {data} = useBacktestReport();
  const available = Boolean(data?.available);

  const handleDownload = () => {
    if (!data) return;
    const payload = JSON.stringify(data, null, 2);
    const blob = new Blob([payload], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const filename = `praxis-backtest-${slugifyTimestamp(data.generated_at)}.json`;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    toast.success("Report downloaded", {description: filename});
  };

  const handleCopyShare = async () => {
    try {
      const base =
        typeof window !== "undefined" ? window.location.href.split("?")[0] : "";
      const snapshot = data?.generated_at || String(Date.now());
      const shareUrl = `${base}?snapshot=${encodeURIComponent(snapshot)}`;
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Copied!", {description: "Share link on clipboard"});
      } else {
        toast.error("Clipboard unavailable");
      }
    } catch {
      toast.error("Could not copy link");
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="toolbar"
      aria-label="Backtest export actions"
    >
      <button
        type="button"
        onClick={handleDownload}
        disabled={!available}
        aria-label="Download backtest report as JSON"
        className={BUTTON_BASE_CLASSES}
        style={{
          background: "var(--color-surface)",
          color: "var(--color-ink-soft)",
          borderColor: "var(--color-rule)",
        }}
        onMouseEnter={(e) => {
          if (available) {
            e.currentTarget.style.background = "var(--color-hover)";
            e.currentTarget.style.color = "var(--color-ink)";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--color-surface)";
          e.currentTarget.style.color = "var(--color-ink-soft)";
        }}
      >
        <Download size={14} strokeWidth={2} aria-hidden="true" />
        <span>Download JSON</span>
      </button>
      <button
        type="button"
        onClick={handleCopyShare}
        aria-label="Copy share link to clipboard"
        className={BUTTON_BASE_CLASSES}
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
      >
        <Share2 size={14} strokeWidth={2} aria-hidden="true" />
        <span>Copy link</span>
      </button>
    </div>
  );
}
