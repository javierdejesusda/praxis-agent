"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

import { HairlineCard } from "@/components/ui/HairlineCard";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  useArtifacts,
  useLatestSignals,
  useOnchainStatus,
  useRegime,
  useStats,
} from "@/lib/hooks";
import { fmtRelative } from "@/lib/format";

function useTweenedNumber(target: number, duration = 0.4): number {
  const [display, setDisplay] = useState(target);
  const prefersReducedMotion = useReducedMotion();
  const lastRef = useRef(target);

  useEffect(() => {
    if (lastRef.current === target) return;
    const from = lastRef.current;
    lastRef.current = target;
    if (prefersReducedMotion) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplay(target);
      return;
    }
    const controls = animate(from, target, {
      duration,
      ease: [0.25, 0.1, 0.25, 1],
      onUpdate: (latest) => setDisplay(latest),
    });
    return () => controls.stop();
  }, [target, duration, prefersReducedMotion]);

  return display;
}

type CountUpProps = {
  value: number;
  format: (n: number) => string;
};

function CountUp({ value, format }: CountUpProps) {
  const display = useTweenedNumber(value);
  return (
    <span className="tabular-nums">{format(display)}</span>
  );
}

function Cell({
  label,
  value,
  loading,
}: {
  label: string;
  value: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="flex flex-col items-start text-left min-w-0">
      <div className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-muted)] mb-1.5 font-medium">
        {label}
      </div>
      {loading ? (
        <Skeleton width={90} height={18} />
      ) : (
        <div className="num font-medium text-[color:var(--color-ink)] text-[15px] leading-tight tracking-[-0.015em] truncate w-full tabular-nums">
          {value}
        </div>
      )}
    </div>
  );
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function regimeLabel(regime: string | undefined): string {
  if (!regime) return "Unknown";
  const r = regime.toLowerCase();
  if (r === "momentum" || r === "trend" || r === "trending") return "Momentum";
  if (r === "mean_reversion" || r === "mean-reversion" || r === "ranging")
    return "Mean Reversion";
  if (r === "unknown") return "Unknown";
  return regime.charAt(0).toUpperCase() + regime.slice(1);
}

function formatInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function formatPctZero(n: number): string {
  return `${Math.round(n)}%`;
}

function AgentsLiveStripImpl() {
  const { data: regime, isLoading: regimeLoading } = useRegime();
  const { data: artifacts, isLoading: artifactsLoading } = useArtifacts(200);
  const { data: latestSignals, isLoading: signalsLoading } = useLatestSignals();
  const { data: stats, isLoading: statsLoading } = useStats();
  const { data: onchain, isLoading: onchainLoading } = useOnchainStatus();

  const cyclesToday = useMemo(() => {
    if (!artifacts) return 0;
    const today = todayUtcDate();
    return artifacts.filter((a) => {
      if (!a.timestamp) return false;
      return a.timestamp.startsWith(today);
    }).length;
  }, [artifacts]);

  const lastActivity = useMemo(() => {
    if (!artifacts || artifacts.length === 0) return null;
    let newest: string | null = null;
    for (const a of artifacts) {
      if (!a.timestamp) continue;
      if (newest == null || a.timestamp > newest) newest = a.timestamp;
    }
    return newest;
  }, [artifacts]);

  const signalCount = latestSignals?.signals?.length ?? 0;

  const attestations = useMemo(() => {
    if (!onchain) return 0;
    if (typeof onchain.total_attestations === "number")
      return onchain.total_attestations;
    return onchain.attestation_totals?.validation ?? 0;
  }, [onchain]);

  const approvalPctValue = useMemo(() => {
    if (!stats) return 0;
    return Number(stats.validation_rate) || 0;
  }, [stats]);

  const regimeValue = useMemo(() => {
    if (!regime) return "\u2014";
    const label = regimeLabel(regime.regime);
    const adx = Number(regime.adx);
    if (!Number.isFinite(adx) || adx <= 0) return label;
    return `${label} \u00b7 ADX ${Math.round(adx)}`;
  }, [regime]);

  return (
    <HairlineCard>
      <div className="flex items-center gap-2.5 mb-4">
        <span
          aria-hidden="true"
          className="live-dot inline-block rounded-full"
          style={{
            width: 7,
            height: 7,
            background: "var(--color-gain)",
            boxShadow: "0 0 0 3px var(--color-gain-soft)",
          }}
        />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-ink-soft)]">
          Live activity
        </h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-4">
        <Cell
          label="Current regime"
          value={regimeValue}
          loading={regimeLoading && !regime}
        />
        <Cell
          label="Strategic cycles"
          value={<CountUp value={cyclesToday} format={formatInt} />}
          loading={artifactsLoading && !artifacts}
        />
        <Cell
          label="Signals last cycle"
          value={<CountUp value={signalCount} format={formatInt} />}
          loading={signalsLoading && !latestSignals}
        />
        <Cell
          label="Governor approval"
          value={
            stats ? (
              <CountUp value={approvalPctValue} format={formatPctZero} />
            ) : (
              "\u2014"
            )
          }
          loading={statsLoading && !stats}
        />
        <Cell
          label="Attestations"
          value={<CountUp value={attestations} format={formatInt} />}
          loading={onchainLoading && !onchain}
        />
        <Cell
          label="Last activity"
          value={lastActivity ? fmtRelative(lastActivity) : "\u2014"}
          loading={artifactsLoading && !artifacts}
        />
      </div>
    </HairlineCard>
  );
}

export const AgentsLiveStrip = memo(AgentsLiveStripImpl);

export default AgentsLiveStrip;
