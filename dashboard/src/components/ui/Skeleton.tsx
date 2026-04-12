"use client";

import React from "react";

type SkeletonProps = {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
  style?: React.CSSProperties;
};

export function Skeleton({
  width = "100%",
  height = 14,
  radius = 6,
  className,
  style,
}: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton-pulse ${className ?? ""}`}
      style={{
        display: "inline-block",
        width,
        height,
        borderRadius: radius,
        background:
          "linear-gradient(90deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.08) 50%, rgba(0,0,0,0.04) 100%)",
        backgroundSize: "200% 100%",
        ...style,
      }}
    />
  );
}

export function SkeletonText({
  lines = 1,
  widths,
}: {
  lines?: number;
  widths?: Array<number | string>;
}) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 6 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={widths?.[i] ?? "100%"} height={12} />
      ))}
    </span>
  );
}

export function SkeletonMetric({ width = 120 }: { width?: number | string }) {
  return <Skeleton width={width} height={24} radius={6} />;
}

export function SkeletonRow({ cols = 4 }: { cols?: number }) {
  return (
    <tr aria-hidden="true">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: "10px 16px" }}>
          <Skeleton height={12} />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonChart({ height = 240 }: { height?: number }) {
  return <Skeleton width="100%" height={height} radius={12} />;
}
