"use client";

import { useCallback, useState } from "react";

import { PageHeader } from "@/components/ui/PageHeader";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { PositionsTable } from "@/components/pages/positions/PositionsTable";
import { EquityAreaChart } from "@/components/pages/positions/EquityAreaChart";
import { DrawdownBar } from "@/components/pages/positions/DrawdownBar";
import { TradesTable } from "@/components/pages/positions/TradesTable";
import { TradeDetailDrawer } from "@/components/pages/positions/TradeDetailDrawer";
import { SkeletonChart } from "@/components/ui/Skeleton";
import type { Artifact } from "@/lib/api";
import { useTrades } from "@/lib/hooks";

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
