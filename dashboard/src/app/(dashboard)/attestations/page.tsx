"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { MetricCell } from "@/components/ui/MetricCell";
import { NumericValue } from "@/components/ui/NumericValue";
import { useOnchainStatus } from "@/lib/hooks";
import { AttestationsTable } from "@/components/pages/attestations/AttestationsTable";

export default function AttestationsPage() {
  const { data } = useOnchainStatus();
  const totals = data?.attestation_totals;
  return (
    <>
      <PageHeader
        eyebrow="On-Chain"
        title="Attestations"
        description="ERC-8004 validation and reputation records anchored on Sepolia."
      />
      <div className="space-y-6">
        <HairlineCard>
          <div className="grid grid-cols-3 gap-8">
            <MetricCell
              label="Validations"
              emphasis="strong"
              value={<NumericValue value={totals?.validation ?? 0} kind="int" />}
            />
            <MetricCell
              label="Reputations"
              emphasis="strong"
              value={<NumericValue value={totals?.reputation ?? 0} kind="int" />}
            />
            <MetricCell
              label="Trade Intents"
              emphasis="strong"
              value={<NumericValue value={totals?.trade_intent ?? 0} kind="int" />}
            />
          </div>
        </HairlineCard>
        <HairlineCard padded={false}>
          <div className="px-5 pt-4">
            <SectionHeader title="Attestation Log" />
          </div>
          <AttestationsTable />
        </HairlineCard>
      </div>
    </>
  );
}
