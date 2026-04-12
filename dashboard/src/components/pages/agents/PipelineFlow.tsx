"use client";

import {useEffect, useMemo, useState} from "react";

import {ArrowRight} from "lucide-react";

import {useArtifacts, useLatestSignals} from "@/lib/hooks";

type StageKey =
  | "market_data"
  | "feature_engine"
  | "signals"
  | "analyst"
  | "risk"
  | "execution";

type Step = {
  key: StageKey;
  label: string;
  sub: string;
  accentVar: string;
};

const STEPS: Step[] = [
  {
    key: "market_data",
    label: "Market Data",
    sub: "OHLCV, 200+ bars",
    accentVar: "var(--color-muted)",
  },
  {
    key: "feature_engine",
    label: "Feature Engine",
    sub: "16 indicators (pandas_ta)",
    accentVar: "var(--color-muted)",
  },
  {
    key: "signals",
    label: "6 Signal Agents",
    sub: "Parallel, deterministic",
    accentVar: "var(--color-accent)",
  },
  {
    key: "analyst",
    label: "GPT Analyst",
    sub: "Meta-analysis + PRISM",
    accentVar: "var(--color-accent)",
  },
  {
    key: "risk",
    label: "Risk Governor",
    sub: "7 kill criteria, Half-Kelly",
    accentVar: "var(--color-loss)",
  },
  {
    key: "execution",
    label: "Dual Execution",
    sub: "Kraken paper + ERC-8004",
    accentVar: "var(--color-gain)",
  },
];

const ACTIVE_WINDOW_MS = 30_000;

function parseTs(value: string | undefined | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function formatAgo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function PipelineFlow() {
  const {data: signals} = useLatestSignals();
  const {data: artifacts} = useArtifacts(5);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const {activeStage, lastActivityMs} = useMemo(() => {
    const candidates: Array<{key: StageKey; ts: number}> = [];

    const signalsTs = parseTs(signals?.timestamp);
    if (signalsTs !== null) {
      candidates.push({key: "signals", ts: signalsTs});
    }

    if (artifacts && artifacts.length > 0) {
      const sorted = [...artifacts].sort((a, b) => {
        return (parseTs(b.timestamp) ?? 0) - (parseTs(a.timestamp) ?? 0);
      });
      for (const art of sorted) {
        const ts = parseTs(art.timestamp);
        if (ts === null) continue;
        const payload = art.payload ?? {};
        if (payload.receipt || payload.intent) {
          candidates.push({key: "execution", ts});
        }
        if (payload.risk_decision) {
          candidates.push({key: "risk", ts});
        }
        if (payload.analyst) {
          candidates.push({key: "analyst", ts});
        }
      }
    }

    if (candidates.length === 0) {
      return {activeStage: null as StageKey | null, lastActivityMs: null as number | null};
    }

    candidates.sort((a, b) => b.ts - a.ts);
    const newest = candidates[0];
    const age = now - newest.ts;
    return {
      activeStage: age <= ACTIVE_WINDOW_MS ? newest.key : null,
      lastActivityMs: age,
    };
  }, [signals, artifacts, now]);

  return (
    <div>
      <div className="flex items-center gap-2 overflow-x-auto py-2">
        {STEPS.map((step, i) => {
          const isActive = step.key === activeStage;
          return (
            <div key={step.key} className="flex items-center gap-2 shrink-0">
              <div
                className={`relative px-4 py-3 rounded-xl text-center min-w-[130px] transition-colors duration-300 ${
                  isActive ? "pipeline-stage-active" : ""
                }`}
                style={{
                  background: isActive
                    ? "var(--color-accent-soft)"
                    : "var(--color-surface)",
                  border: isActive
                    ? "1.5px solid var(--color-accent)"
                    : `1.5px solid ${step.accentVar === "var(--color-muted)" ? "var(--color-rule)" : "var(--color-rule-strong)"}`,
                  backdropFilter: "blur(12px)",
                }}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="live-dot absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                    style={{background: "var(--color-accent)"}}
                  />
                )}
                <div className="text-[12px] font-semibold text-[color:var(--color-ink)]">
                  {step.label}
                </div>
                <div className="text-[10px] text-[color:var(--color-muted)] mt-0.5">
                  {step.sub}
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <ArrowRight
                  size={14}
                  className="text-[color:var(--color-muted-soft)] shrink-0"
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-muted-soft)]">
        <span>Pipeline status</span>
        <span aria-hidden="true">·</span>
        {activeStage ? (
          <span className="text-[color:var(--color-accent)]">
            Active stage live
          </span>
        ) : (
          <span>Idle</span>
        )}
        {lastActivityMs !== null && (
          <>
            <span aria-hidden="true">·</span>
            <span>Last activity {formatAgo(lastActivityMs)}</span>
          </>
        )}
      </div>
    </div>
  );
}
