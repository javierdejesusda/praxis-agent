"use client";
import { PageHeader } from "@/components/ui/PageHeader";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { PositionsTable } from "@/components/pages/positions/PositionsTable";
import { EquityAreaChart } from "@/components/pages/positions/EquityAreaChart";
import { DrawdownBar } from "@/components/pages/positions/DrawdownBar";
import { TradesTable } from "@/components/pages/positions/TradesTable";

export default function PositionsPage() {
  return (
    <>
      <PageHeader eyebrow="Book" title="Positions & P&L" description="Open exposure, equity curve, trade history." />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          <HairlineCard>
            <SectionHeader title="Equity Curve" />
            <EquityAreaChart />
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
        <TradesTable />
      </HairlineCard>
    </>
  );
}
