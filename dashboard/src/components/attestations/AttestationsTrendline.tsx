"use client";

import { useMemo, useSyncExternalStore } from "react";

import {HairlineCard} from "@/components/ui/HairlineCard";
import {NumericValue} from "@/components/ui/NumericValue";
import {useAttestations} from "@/lib/hooks";
import type {Attestation} from "@/lib/api";

const HOUR_MS = 60 * 60 * 1000;
const BUCKETS = 24;

function subscribeNow(onChange: () => void): () => void {
  const id = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(id);
}
function getNow(): number {
  return Date.now();
}
function getNowServer(): number {
  return 0;
}

type Buckets = {
  current: number[];
  previous: number[];
  currentTotal: number;
  previousTotal: number;
};

function bucketize(records: Attestation[], now: number): Buckets {
  const current = new Array<number>(BUCKETS).fill(0);
  const previous = new Array<number>(BUCKETS).fill(0);
  const currentStart = now - BUCKETS * HOUR_MS;
  const previousStart = currentStart - BUCKETS * HOUR_MS;

  for (const r of records) {
    const ts = Date.parse(r.timestamp);
    if (!Number.isFinite(ts)) continue;
    if (ts >= currentStart && ts <= now) {
      const idx = Math.min(
        BUCKETS - 1,
        Math.floor((ts - currentStart) / HOUR_MS),
      );
      current[idx] += 1;
    } else if (ts >= previousStart && ts < currentStart) {
      const idx = Math.min(
        BUCKETS - 1,
        Math.floor((ts - previousStart) / HOUR_MS),
      );
      previous[idx] += 1;
    }
  }

  return {
    current,
    previous,
    currentTotal: current.reduce((a, b) => a + b, 0),
    previousTotal: previous.reduce((a, b) => a + b, 0),
  };
}

function TrendSparkline({data}: {data: number[]}) {
  const width = 220;
  const height = 44;
  if (data.length < 2 || data.every((v) => v === 0)) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
      >
        <line
          x1={0}
          y1={height - 1}
          x2={width}
          y2={height - 1}
          stroke="var(--color-rule)"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
      </svg>
    );
  }
  const min = 0;
  const max = Math.max(...data, 1);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => {
    const x = i * step;
    const y = height - 2 - ((v - min) / range) * (height - 4);
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area =
    `${pts[0][0].toFixed(2)},${(height - 1).toFixed(2)} ` +
    line +
    ` ${pts[pts.length - 1][0].toFixed(2)},${(height - 1).toFixed(2)}`;
  const last = pts[pts.length - 1];
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <polygon points={area} fill="var(--color-accent-soft)" />
      <polyline
        points={line}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r={1.75} fill="var(--color-accent)" />
    </svg>
  );
}

export function AttestationsTrendline() {
  const { data } = useAttestations();
  const records = data?.records;

  // Next 16's React Compiler purity rule rejects Date.now() in render, and
  // the set-state-in-effect rule rejects a useEffect tick. useSyncExternalStore
  // threads both needles: nowMs is sourced from a store that ticks once a
  // minute so the 24h window slides.
  const nowMs = useSyncExternalStore(subscribeNow, getNow, getNowServer);

  const buckets = useMemo<Buckets>(
    () => bucketize(records ?? [], nowMs),
    [records, nowMs],
  );

  const delta = useMemo(() => {
    if (buckets.previousTotal === 0) {
      return buckets.currentTotal > 0 ? Infinity : 0;
    }
    return (
      ((buckets.currentTotal - buckets.previousTotal) / buckets.previousTotal) *
      100
    );
  }, [buckets]);

  const hasActivity = buckets.currentTotal > 0 || buckets.previousTotal > 0;

  const deltaTone =
    delta === 0
      ? "var(--color-muted)"
      : delta > 0
        ? "var(--color-gain)"
        : "var(--color-loss)";
  const deltaLabel =
    !Number.isFinite(delta)
      ? "New activity"
      : `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}% vs prior 24h`;

  return (
    <HairlineCard>
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--color-muted)]">
            Attestations &middot; last 24h
          </div>
          {hasActivity ? (
            <>
              <div className="flex items-baseline gap-3">
                <span className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--color-ink)] tabular-nums">
                  <NumericValue value={buckets.currentTotal} kind="int" />
                </span>
                <span
                  className="text-[11px] font-medium tabular-nums"
                  style={{color: deltaTone}}
                >
                  {deltaLabel}
                </span>
              </div>
              <div className="text-[11px] text-[color:var(--color-muted-soft)] uppercase tracking-[0.06em]">
                UTC
              </div>
            </>
          ) : (
            <div className="text-[13px] text-[color:var(--color-muted)] pt-1">
              Awaiting first attestation
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <TrendSparkline data={buckets.current} />
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.06em] text-[color:var(--color-muted-soft)]">
            <span>-24h</span>
            <span aria-hidden="true">&rarr;</span>
            <span>now</span>
          </div>
        </div>
      </div>
    </HairlineCard>
  );
}
