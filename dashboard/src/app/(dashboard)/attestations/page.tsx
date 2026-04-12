"use client";

import {useMemo} from "react";

import {AttestationsTable} from "@/components/attestations/AttestationsTable";
import {AttestationsTrendline} from "@/components/attestations/AttestationsTrendline";
import {HackathonVaultBadge} from "@/components/attestations/HackathonVaultBadge";
import {HairlineCard} from "@/components/ui/HairlineCard";
import {MetricCell} from "@/components/ui/MetricCell";
import {NumericValue} from "@/components/ui/NumericValue";
import {PageHeader} from "@/components/ui/PageHeader";
import {SectionHeader} from "@/components/ui/SectionHeader";
import {SkeletonMetric} from "@/components/ui/Skeleton";
import {useAttestations, useOnchainStatus} from "@/lib/hooks";

type LegendItem = {
  label: string;
  dotVar: string;
  description: string;
};

const LEGEND: LegendItem[] = [
  {
    label: "Validation",
    dotVar: "var(--color-accent)",
    description:
      "Self-reported ERC-8004 quality scores (0–100) for each emitted artifact.",
  },
  {
    label: "Reputation",
    dotVar: "var(--color-warn)",
    description:
      "Outcome feedback written back to the agent registry after a trade settles.",
  },
  {
    label: "Trade Intent",
    dotVar: "var(--color-muted)",
    description:
      "EIP-712 signed intents anchored on Sepolia before execution through the Risk Router.",
  },
];

export default function AttestationsPage() {
  const {data: onchain, isLoading: onchainLoading} = useOnchainStatus();
  const {data: attestations, isLoading: attestationsLoading} = useAttestations();

  const totals = onchain?.attestation_totals;
  const records = useMemo(
    () => attestations?.records ?? [],
    [attestations?.records],
  );
  const metricsLoading = onchainLoading && !totals;

  return (
    <>
      <PageHeader
        eyebrow="On-Chain"
        title="Attestations"
        description="ERC-8004 validation, reputation and trade-intent records anchored on Sepolia."
      />
      <div className="space-y-6">
        <AttestationsTrendline />
        <HairlineCard>
          <div className="grid grid-cols-3 gap-8">
            <MetricCell
              label="Validations"
              emphasis="strong"
              value={
                metricsLoading ? (
                  <SkeletonMetric width={80} />
                ) : (
                  <NumericValue value={totals?.validation ?? 0} kind="int" />
                )
              }
            />
            <MetricCell
              label="Reputations"
              emphasis="strong"
              value={
                metricsLoading ? (
                  <SkeletonMetric width={80} />
                ) : (
                  <NumericValue value={totals?.reputation ?? 0} kind="int" />
                )
              }
            />
            <MetricCell
              label="Trade Intents"
              emphasis="strong"
              value={
                metricsLoading ? (
                  <SkeletonMetric width={80} />
                ) : (
                  <NumericValue value={totals?.trade_intent ?? 0} kind="int" />
                )
              }
            />
          </div>
        </HairlineCard>

        <HackathonVaultBadge />

        <HairlineCard>
          <SectionHeader title="Legend" />
          <ul className="space-y-2.5">
            {LEGEND.map((item) => (
              <li key={item.label} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="inline-block w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                  style={{background: item.dotVar}}
                />
                <div>
                  <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[color:var(--color-ink)]">
                    {item.label}
                  </div>
                  <div className="text-[12px] text-[color:var(--color-muted)] leading-relaxed">
                    {item.description}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </HairlineCard>

        <HairlineCard padded={false}>
          <div className="px-5 pt-4">
            <SectionHeader title="Attestation Log" count={records.length} />
          </div>
          <AttestationsTable
            records={records}
            isLoading={attestationsLoading && records.length === 0}
          />
        </HairlineCard>
      </div>
    </>
  );
}
