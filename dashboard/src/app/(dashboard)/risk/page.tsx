"use client";

import dynamic from "next/dynamic";

import { PageHeader } from "@/components/ui/PageHeader";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SkeletonChart } from "@/components/ui/Skeleton";

const KillCriteriaTable = dynamic(
  () =>
    import("@/components/pages/risk/KillCriteriaTable").then((m) => ({
      default: m.KillCriteriaTable,
    })),
  { ssr: false, loading: () => <SkeletonChart height={320} /> },
);

export default function RiskPage() {
  return (
    <>
      <PageHeader
        eyebrow="Governor"
        title="Risk & Kill Criteria"
        description="Seven deterministic gates enforced before any trade: data freshness, output integrity, ledger reconciliation, spread, daily loss cap, max drawdown, and the manual kill switch. Every row is announced live so assistive tech hears trips immediately."
      />
      <HairlineCard padded={false}>
        <div className="px-5 pt-4">
          <SectionHeader title="Kill Criteria" />
        </div>
        <KillCriteriaTable />
      </HairlineCard>
    </>
  );
}
