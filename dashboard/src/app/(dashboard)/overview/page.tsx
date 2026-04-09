"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { KpiStrip } from "@/components/pages/overview/KpiStrip";
import { RegimeCard } from "@/components/pages/overview/RegimeCard";
import { LatestSignalCard } from "@/components/pages/overview/LatestSignalCard";
import { KillSummary } from "@/components/pages/overview/KillSummary";
import { LivePriceChart } from "@/components/pages/overview/LivePriceChart";

export default function OverviewPage() {
  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title="Overview"
        description="Live portfolio state, regime, and risk summary."
      />
      <div className="space-y-5">
        <KpiStrip />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <LivePriceChart pair="BTCUSD" />
          <LivePriceChart pair="ETHUSD" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <LatestSignalCard />
          <RegimeCard />
          <KillSummary />
        </div>
      </div>
    </>
  );
}
