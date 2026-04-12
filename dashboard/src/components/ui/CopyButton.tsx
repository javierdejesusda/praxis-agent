"use client";

import React, { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";

type CopyButtonProps = {
  value: string;
  label?: string;
  size?: number;
  truncate?: number;
  className?: string;
};

export function CopyButton({
  value,
  label,
  size = 12,
  truncate,
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      try {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      } catch {
        // Clipboard permission denied — silently no-op.
      }
    },
    [value],
  );

  const displayLabel =
    label ??
    (truncate && value.length > truncate
      ? `${value.slice(0, truncate)}…${value.slice(-4)}`
      : value);

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Copied" : `Copy ${value}`}
      className={`inline-flex items-center gap-1.5 font-mono tabular-nums hover:text-[color:var(--color-ink)] ${className ?? ""}`}
      style={{
        background: "transparent",
        border: "none",
        cursor: "pointer",
        fontSize: size,
        color: copied ? "var(--color-gain)" : "var(--color-ink-soft)",
        padding: "2px 4px",
        borderRadius: 4,
      }}
    >
      <span>{displayLabel}</span>
      {copied ? (
        <Check size={size} strokeWidth={2.5} />
      ) : (
        <Copy size={size} strokeWidth={2} style={{ opacity: 0.55 }} />
      )}
    </button>
  );
}
