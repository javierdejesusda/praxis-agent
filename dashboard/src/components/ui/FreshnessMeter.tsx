"use client";

import {useEffect, useState} from "react";

type FreshnessMeterProps = {
  updatedAt: Date | string | number;
  staleAfterMs?: number;
};

function toMs(updatedAt: Date | string | number): number {
  if (updatedAt instanceof Date) return updatedAt.getTime();
  if (typeof updatedAt === "number") return updatedAt;
  const parsed = Date.parse(updatedAt);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function formatRelative(deltaMs: number): string {
  const seconds = Math.max(0, Math.floor(deltaMs / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function FreshnessMeter({
  updatedAt,
  staleAfterMs = 30000,
}: FreshnessMeterProps) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const updatedMs = toMs(updatedAt);
  const delta = Math.max(0, now - updatedMs);
  const ratio = delta / staleAfterMs;

  let color: string;
  let fresh: boolean;
  if (ratio < 0.5) {
    color = "var(--color-gain)";
    fresh = true;
  } else if (ratio <= 1) {
    color = "var(--color-warn)";
    fresh = false;
  } else {
    color = "var(--color-loss)";
    fresh = false;
  }

  const animationClass = fresh ? "live-dot" : "";
  const staleFadeStyle = !fresh
    ? {animation: "freshness-fade 3.6s cubic-bezier(0.4, 0, 0.6, 1) infinite"}
    : undefined;

  return (
    <span
      className="inline-flex items-center gap-1.5"
      style={{fontVariantNumeric: "tabular-nums"}}
    >
      <span
        aria-hidden="true"
        className={animationClass}
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: 999,
          background: color,
          ...staleFadeStyle,
        }}
      />
      <span
        className="text-[11px] font-mono tabular-nums text-[color:var(--color-muted)]"
        aria-label={`Updated ${formatRelative(delta)}`}
      >
        {formatRelative(delta)}
      </span>
    </span>
  );
}
