"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import DecisionWalkthrough from "@/components/pages/overview/DecisionWalkthrough";
import { KpiStrip } from "@/components/pages/overview/KpiStrip";
import { PerformanceStrip } from "@/components/pages/overview/PerformanceStrip";
import { RegimeCard } from "@/components/pages/overview/RegimeCard";
import { LatestSignalCard } from "@/components/pages/overview/LatestSignalCard";
import { KillSummary } from "@/components/pages/overview/KillSummary";
import { LivePriceChart } from "@/components/pages/overview/LivePriceChart";
import { RecentDecisions } from "@/components/pages/overview/RecentDecisions";

export default function OverviewPage() {
  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title="Overview"
        description="Live portfolio state, regime, and risk summary."
      />
      <div className="space-y-6">
        <DecisionWalkthrough />
        <KpiStrip />
        <PerformanceStrip />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LivePriceChart pair="BTCUSD" />
          <LivePriceChart pair="ETHUSD" />
        </div>
        <RecentDecisions />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <LatestSignalCard />
          <RegimeCard />
          <KillSummary />
        </div>
      </div>
    </>
  );
}
