"use client";

import dynamic from "next/dynamic";

import {PageHeader} from "@/components/ui/PageHeader";
import {SkeletonChart, SkeletonText} from "@/components/ui/Skeleton";

const DecisionWalkthrough = dynamic(
  () =>
    import("@/components/pages/overview/DecisionWalkthrough").then((m) => ({
      default: m.default,
    })),
  {ssr: false, loading: () => <SkeletonChart height={180} />},
);
const KpiStrip = dynamic(
  () =>
    import("@/components/pages/overview/KpiStrip").then((m) => ({
      default: m.KpiStrip,
    })),
  {ssr: false, loading: () => <SkeletonText lines={1} widths={["60%"]} />},
);
const PerformanceStrip = dynamic(
  () =>
    import("@/components/pages/overview/PerformanceStrip").then((m) => ({
      default: m.PerformanceStrip,
    })),
  {ssr: false, loading: () => <SkeletonChart height={120} />},
);
const RegimeCard = dynamic(
  () =>
    import("@/components/pages/overview/RegimeCard").then((m) => ({
      default: m.RegimeCard,
    })),
  {ssr: false, loading: () => <SkeletonChart height={140} />},
);
const LatestSignalCard = dynamic(
  () =>
    import("@/components/pages/overview/LatestSignalCard").then((m) => ({
      default: m.LatestSignalCard,
    })),
  {ssr: false, loading: () => <SkeletonChart height={140} />},
);
const KillSummary = dynamic(
  () =>
    import("@/components/pages/overview/KillSummary").then((m) => ({
      default: m.KillSummary,
    })),
  {ssr: false, loading: () => <SkeletonChart height={140} />},
);
const LivePriceChart = dynamic(
  () =>
    import("@/components/pages/overview/LivePriceChart").then((m) => ({
      default: m.LivePriceChart,
    })),
  {ssr: false, loading: () => <SkeletonChart height={260} />},
);
const RecentDecisions = dynamic(
  () =>
    import("@/components/pages/overview/RecentDecisions").then((m) => ({
      default: m.RecentDecisions,
    })),
  {ssr: false, loading: () => <SkeletonChart height={220} />},
);

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
