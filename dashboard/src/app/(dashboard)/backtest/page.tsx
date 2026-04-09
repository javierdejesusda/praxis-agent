"use client";
import { PageHeader } from "@/components/ui/PageHeader";
import { useBacktestReport } from "@/lib/hooks";
import { BacktestCombinedStrip } from "@/components/pages/backtest/BacktestCombinedStrip";
import { PerPairTable } from "@/components/pages/backtest/PerPairTable";
import { BacktestConfigBlock } from "@/components/pages/backtest/BacktestConfigBlock";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function BacktestPage() {
  const { data } = useBacktestReport();
  if (!data?.available) {
    return (
      <>
        <PageHeader eyebrow="Historical" title="Backtest" />
        <HairlineCard><EmptyState label="No backtest report generated." sub="Run scripts/final_report.py to populate state/backtest_report.json." /></HairlineCard>
      </>
    );
  }
  return (
    <>
      <PageHeader eyebrow="Historical" title="Backtest" description={`Generated ${data.generated_at}`} />
      <div className="space-y-5">
        <BacktestCombinedStrip />
        <HairlineCard padded={false}>
          <div className="px-4 pt-3"><SectionHeader title="Per-Pair Breakdown" /></div>
          <PerPairTable />
        </HairlineCard>
        <HairlineCard>
          <SectionHeader title="Configuration" />
          <BacktestConfigBlock />
        </HairlineCard>
      </div>
    </>
  );
}
