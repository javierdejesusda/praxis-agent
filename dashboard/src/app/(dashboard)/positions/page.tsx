"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";

import { PageHeader } from "@/components/ui/PageHeader";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SkeletonChart } from "@/components/ui/Skeleton";
import type { Artifact } from "@/lib/api";
import { useTrades } from "@/lib/hooks";

const PositionsTable = dynamic(
  () =>
    import("@/components/pages/positions/PositionsTable").then((m) => ({
      default: m.PositionsTable,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="p-5">
        <SkeletonChart height={120} />
      </div>
    ),
  },
);
const EquityAreaChart = dynamic(
  () =>
    import("@/components/pages/positions/EquityAreaChart").then((m) => ({
      default: m.EquityAreaChart,
    })),
  { ssr: false, loading: () => <SkeletonChart height={220} /> },
);
const DrawdownBar = dynamic(
  () =>
    import("@/components/pages/positions/DrawdownBar").then((m) => ({
      default: m.DrawdownBar,
    })),
  { ssr: false, loading: () => <SkeletonChart height={140} /> },
);
const TradesTable = dynamic(
  () =>
    import("@/components/pages/positions/TradesTable").then((m) => ({
      default: m.TradesTable,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="p-5">
        <SkeletonChart height={180} />
      </div>
    ),
  },
);
const TradeDetailDrawer = dynamic(
  () =>
    import("@/components/pages/positions/TradeDetailDrawer").then((m) => ({
      default: m.TradeDetailDrawer,
    })),
  { ssr: false, loading: () => null },
);

export default function PositionsPage() {
  const [selected, setSelected] = useState<Artifact | null>(null);
  const { isLoading: tradesLoading } = useTrades();

  const handleSelect = useCallback((artifact: Artifact) => {
    setSelected(artifact);
  }, []);

  const handleClose = useCallback(() => {
    setSelected(null);
  }, []);

  const selectedKey = selected
    ? selected.hash || `${selected.timestamp}-${selected.type}`
    : null;

  return (
    <>
      <PageHeader
        eyebrow="Book"
        title="Positions & P&L"
        description="Open exposure, equity curve, trade history."
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          <HairlineCard>
            <SectionHeader title="Equity Curve" />
            {tradesLoading ? (
              <SkeletonChart height={220} />
            ) : (
              <EquityAreaChart />
            )}
          </HairlineCard>
        </div>
        <HairlineCard>
          <SectionHeader title="Drawdown" />
          <DrawdownBar />
        </HairlineCard>
      </div>
      <HairlineCard padded={false} className="mb-6">
        <div className="px-5 pt-4">
          <SectionHeader title="Open Positions" />
        </div>
        <PositionsTable />
      </HairlineCard>
      <HairlineCard padded={false}>
        <div className="px-5 pt-4">
          <SectionHeader title="Trade History" />
        </div>
        <TradesTable onSelect={handleSelect} selectedKey={selectedKey} />
      </HairlineCard>
      <TradeDetailDrawer artifact={selected} onClose={handleClose} />
    </>
  );
}
