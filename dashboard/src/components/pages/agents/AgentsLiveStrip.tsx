"use client";

import { useMemo } from "react";

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
        <div className="num font-medium text-[color:var(--color-ink)] text-[15px] leading-tight tracking-[-0.015em] truncate w-full">
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

export function AgentsLiveStrip() {
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

  const approvalPct = useMemo(() => {
    if (!stats) return null;
    const r = Number(stats.validation_rate) || 0;
    return `${(r * 100).toFixed(0)}%`;
  }, [stats]);

  const regimeValue = useMemo(() => {
    if (!regime) return "—";
    const label = regimeLabel(regime.regime);
    const adx = Number(regime.adx);
    if (!Number.isFinite(adx) || adx <= 0) return label;
    return `${label} · ADX ${Math.round(adx)}`;
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
          value={cyclesToday.toLocaleString("en-US")}
          loading={artifactsLoading && !artifacts}
        />
        <Cell
          label="Signals last cycle"
          value={signalCount}
          loading={signalsLoading && !latestSignals}
        />
        <Cell
          label="Governor approval"
          value={approvalPct ?? "—"}
          loading={statsLoading && !stats}
        />
        <Cell
          label="Attestations"
          value={attestations.toLocaleString("en-US")}
          loading={onchainLoading && !onchain}
        />
        <Cell
          label="Last activity"
          value={lastActivity ? fmtRelative(lastActivity) : "—"}
          loading={artifactsLoading && !artifacts}
        />
      </div>
    </HairlineCard>
  );
}

export default AgentsLiveStrip;
