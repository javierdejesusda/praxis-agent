"use client";

import {useEffect, useMemo, useState, useSyncExternalStore} from "react";
import {
  Area,
  ComposedChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {HairlineCard} from "@/components/ui/HairlineCard";
import {NumericValue} from "@/components/ui/NumericValue";
import {useAttestations} from "@/lib/hooks";
import type {Attestation} from "@/lib/api";

const HOUR_MS = 60 * 60 * 1000;
const BUCKETS = 24;

let nowSnapshot = 0;
const nowListeners = new Set<() => void>();
let nowIntervalId: number | null = null;
function subscribeNow(onChange: () => void): () => void {
  if (nowSnapshot === 0) nowSnapshot = Date.now();
  nowListeners.add(onChange);
  if (nowIntervalId === null) {
    nowIntervalId = window.setInterval(() => {
      nowSnapshot = Date.now();
      nowListeners.forEach((fn) => fn());
    }, 60_000);
  }
  return () => {
    nowListeners.delete(onChange);
    if (nowListeners.size === 0 && nowIntervalId !== null) {
      window.clearInterval(nowIntervalId);
      nowIntervalId = null;
    }
  };
}
function getNow(): number {
  if (nowSnapshot === 0) nowSnapshot = Date.now();
  return nowSnapshot;
}
function getNowServer(): number {
  return 0;
}

type BucketPoint = {
  bucketStart: number;
  hourOffset: number;
  count: number;
  cumulative: number;
};

type Buckets = {
  current: BucketPoint[];
  currentTotal: number;
  previousTotal: number;
};

function bucketize(records: Attestation[], now: number): Buckets {
  const currentCounts = new Array<number>(BUCKETS).fill(0);
  const previousCounts = new Array<number>(BUCKETS).fill(0);
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
      currentCounts[idx] += 1;
    } else if (ts >= previousStart && ts < currentStart) {
      const idx = Math.min(
        BUCKETS - 1,
        Math.floor((ts - previousStart) / HOUR_MS),
      );
      previousCounts[idx] += 1;
    }
  }

  let cumulative = 0;
  const current: BucketPoint[] = currentCounts.map((count, i) => {
    cumulative += count;
    return {
      bucketStart: currentStart + i * HOUR_MS,
      hourOffset: i - (BUCKETS - 1),
      count,
      cumulative,
    };
  });

  return {
    current,
    currentTotal: cumulative,
    previousTotal: previousCounts.reduce((a, b) => a + b, 0),
  };
}

type ResolvedPalette = {
  ink: string;
  muted: string;
  accent: string;
  accentSoft: string;
  loss: string;
  surface: string;
  rule: string;
};

function readVar(el: HTMLElement, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

function usePalette(): ResolvedPalette | null {
  const [palette, setPalette] = useState<ResolvedPalette | null>(null);
  useEffect(() => {
    const read = () => {
      const el = document.documentElement;
      setPalette({
        ink: readVar(el, "--color-ink"),
        muted: readVar(el, "--color-muted"),
        accent: readVar(el, "--color-accent"),
        accentSoft: readVar(el, "--color-accent-soft"),
        loss: readVar(el, "--color-loss"),
        surface: readVar(el, "--color-surface-solid"),
        rule: readVar(el, "--color-rule"),
      });
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    return () => mo.disconnect();
  }, []);
  return palette;
}

type TopScoreMarker = {
  bucketStart: number;
  cumulative: number;
  score: number;
  pair: string;
};

function topScoreMarkers(
  records: Attestation[],
  points: BucketPoint[],
  now: number,
): TopScoreMarker[] {
  const windowStart = now - BUCKETS * HOUR_MS;
  const scored = records
    .filter((r) => {
      if (r.score == null) return false;
      const ts = Date.parse(r.timestamp);
      return (
        Number.isFinite(ts) && ts >= windowStart && ts <= now
      );
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 3);
  if (scored.length === 0 || points.length === 0) return [];
  const bucketSize = HOUR_MS;
  return scored.map((r) => {
    const ts = Date.parse(r.timestamp);
    const idx = Math.min(
      BUCKETS - 1,
      Math.max(0, Math.floor((ts - points[0].bucketStart) / bucketSize)),
    );
    const point = points[idx];
    return {
      bucketStart: point.bucketStart,
      cumulative: point.cumulative,
      score: r.score ?? 0,
      pair: r.pair || "—",
    };
  });
}

function AttestationsTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{payload?: BucketPoint}>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const hourLabel =
    p.hourOffset === 0
      ? "now"
      : p.hourOffset < 0
        ? `${p.hourOffset}h`
        : `+${p.hourOffset}h`;
  return (
    <div
      className="rounded-lg px-2.5 py-2 text-[11px]"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-rule)",
        color: "var(--color-ink)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
      }}
    >
      <div
        className="uppercase tracking-[0.08em] text-[9px] mb-1"
        style={{color: "var(--color-muted)"}}
      >
        {hourLabel}
      </div>
      <div className="num tabular-nums">
        <span style={{color: "var(--color-ink-soft)"}}>cumulative </span>
        <span style={{color: "var(--color-accent)"}}>{p.cumulative}</span>
      </div>
      <div
        className="num tabular-nums text-[10px]"
        style={{color: "var(--color-muted)"}}
      >
        +{p.count} this hour
      </div>
    </div>
  );
}

export function AttestationsTrendline() {
  const {data} = useAttestations();
  const records = data?.records;
  const palette = usePalette();

  // Next 16's React Compiler purity rule rejects Date.now() in render, and
  // the set-state-in-effect rule rejects a useEffect tick. useSyncExternalStore
  // threads both needles: nowMs is sourced from a store that ticks once a
  // minute so the 24h window slides.
  const nowMs = useSyncExternalStore(subscribeNow, getNow, getNowServer);

  const buckets = useMemo<Buckets>(
    () => bucketize(records ?? [], nowMs),
    [records, nowMs],
  );

  const bucketCurrent = buckets.current;
  const scoreMarkers = useMemo(
    () => topScoreMarkers(records ?? [], bucketCurrent, nowMs),
    [records, bucketCurrent, nowMs],
  );
  const yDomainMax = useMemo(
    () => Math.max(1, ...bucketCurrent.map((p) => p.cumulative)),
    [bucketCurrent],
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
  const deltaLabel = !Number.isFinite(delta)
    ? "New activity"
    : `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}% vs prior 24h`;

  const accent = palette?.accent ?? "#2563eb";
  const accentSoft = palette?.accentSoft ?? "rgba(37,99,235,0.18)";
  const mutedStroke = palette?.muted ?? "#6b7280";
  // Reserved for future kill-switch ReferenceDots once /api/kill-history lands.
  void palette?.loss;

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
                UTC &middot; cumulative
              </div>
            </>
          ) : (
            <div className="text-[13px] text-[color:var(--color-muted)] pt-1">
              Awaiting first attestation
            </div>
          )}
        </div>
      </div>
      <div className="mt-3" style={{width: "100%", height: 96}}>
        {hasActivity ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={buckets.current}
              margin={{top: 14, right: 12, left: 0, bottom: 2}}
            >
              <defs>
                <linearGradient id="attArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="hourOffset"
                type="number"
                domain={[-(BUCKETS - 1), 0]}
                ticks={[-(BUCKETS - 1), -12, 0]}
                tickFormatter={(v: number) =>
                  v === 0 ? "now" : `${v}h`
                }
                tick={{
                  fill: mutedStroke,
                  fontSize: 9,
                  fontFamily: "var(--font-mono)",
                }}
                axisLine={{stroke: palette?.rule ?? "#e5e7eb"}}
                tickLine={false}
                height={14}
              />
              <YAxis hide domain={[0, yDomainMax]} />
              <Tooltip
                content={<AttestationsTooltip />}
                cursor={{
                  stroke: mutedStroke,
                  strokeDasharray: "2 3",
                  strokeWidth: 1,
                }}
              />
              <Area
                type="monotone"
                dataKey="cumulative"
                stroke={accent}
                strokeWidth={1.5}
                fill="url(#attArea)"
                isAnimationActive={false}
                dot={false}
                activeDot={{
                  r: 3,
                  fill: accent,
                  stroke: palette?.surface ?? "#fff",
                  strokeWidth: 1.5,
                }}
              />
              {scoreMarkers.map((m, i) => (
                <ReferenceDot
                  key={`top-${i}-${m.bucketStart}`}
                  x={
                    buckets.current.find(
                      (p) => p.bucketStart === m.bucketStart,
                    )?.hourOffset ?? 0
                  }
                  y={m.cumulative}
                  r={4}
                  fill={accent}
                  stroke={palette?.surface ?? "#fff"}
                  strokeWidth={1.5}
                  ifOverflow="extendDomain"
                />
              ))}
              {/*
                Regime-flip ReferenceLine and kill-switch ReferenceDot
                markers are intentionally omitted: neither /api/attestations
                nor /api/regime currently exposes historical regime
                transitions or kill activations, so fabricating them would
                mislead. The chart degrades to top-validation-score dots
                only and will re-enable the other event types automatically
                once those series become available.
              */}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div
            className="h-full w-full rounded-md"
            style={{
              border: "1px dashed var(--color-rule)",
              background: "transparent",
            }}
          />
        )}
      </div>
      <div className="mt-1 flex items-center justify-between text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-muted-soft)]">
        <span>-24h</span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{background: accentSoft, border: `1px solid ${accent}`}}
            aria-hidden="true"
          />
          top validation scores
        </span>
        <span>now</span>
      </div>
    </HairlineCard>
  );
}
