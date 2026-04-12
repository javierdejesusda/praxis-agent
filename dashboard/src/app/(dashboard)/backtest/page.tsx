"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { useBacktestReport } from "@/lib/hooks";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonChart, SkeletonText } from "@/components/ui/Skeleton";
import { fmtTimestamp } from "@/lib/format";

const BacktestCombinedStrip = dynamic(
  () =>
    import("@/components/pages/backtest/BacktestCombinedStrip").then((m) => ({
      default: m.BacktestCombinedStrip,
    })),
  { ssr: false, loading: () => <SkeletonChart height={140} /> },
);
const BacktestExportBar = dynamic(
  () =>
    import("@/components/pages/backtest/BacktestExportBar").then((m) => ({
      default: m.BacktestExportBar,
    })),
  { ssr: false, loading: () => null },
);
const PerPairTable = dynamic(
  () =>
    import("@/components/pages/backtest/PerPairTable").then((m) => ({
      default: m.PerPairTable,
    })),
  { ssr: false, loading: () => <SkeletonChart height={180} /> },
);
const BacktestConfigBlock = dynamic(
  () =>
    import("@/components/pages/backtest/BacktestConfigBlock").then((m) => ({
      default: m.BacktestConfigBlock,
    })),
  { ssr: false, loading: () => <SkeletonChart height={160} /> },
);
const ValidationSplit = dynamic(
  () =>
    import("@/components/pages/backtest/ValidationSplit").then((m) => ({
      default: m.ValidationSplit,
    })),
  { ssr: false, loading: () => <SkeletonChart height={200} /> },
);
const SnapshotBanner = dynamic(
  () =>
    import("@/components/pages/backtest/SnapshotBanner").then((m) => ({
      default: m.SnapshotBanner,
    })),
  { ssr: false, loading: () => null },
);

function SnapshotBannerSlot({
  currentGeneratedAt,
}: {
  currentGeneratedAt: string | null;
}) {
  const searchParams = useSearchParams();
  const snapshotParam = searchParams.get("snapshot");
  if (!snapshotParam) return null;
  return (
    <SnapshotBanner
      snapshot={snapshotParam}
      currentGeneratedAt={currentGeneratedAt}
    />
  );
}

export default function BacktestPage() {
  const { data, isLoading } = useBacktestReport();
  const currentGeneratedAt = data?.generated_at ?? null;
  const banner = (
    <Suspense fallback={null}>
      <SnapshotBannerSlot currentGeneratedAt={currentGeneratedAt} />
    </Suspense>
  );

  if (isLoading) {
    return (
      <>
        {banner}
        <PageHeader
          eyebrow="Historical"
          title="Backtest"
          rightSlot={<BacktestExportBar />}
        />
        <div className="space-y-6">
          <BacktestCombinedStrip />
          <HairlineCard>
            <SkeletonText
              lines={3}
              widths={["40%", "60%", "50%"]}
            />
          </HairlineCard>
        </div>
      </>
    );
  }

  if (!data?.available) {
    return (
      <>
        {banner}
        <PageHeader
          eyebrow="Historical"
          title="Backtest"
          rightSlot={<BacktestExportBar />}
        />
        <HairlineCard>
          <EmptyState
            label="No backtest report generated."
            sub="Run scripts/final_report.py to populate state/backtest_report.json."
          />
        </HairlineCard>
      </>
    );
  }

  return (
    <>
      {banner}
      <PageHeader
        eyebrow="Historical"
        title="Backtest"
        description={`Generated ${fmtTimestamp(data.generated_at)}`}
        rightSlot={<BacktestExportBar />}
      />
      <div className="space-y-6">
        <BacktestCombinedStrip />
        <ValidationSplit />
        <HairlineCard padded={false}>
          <div className="px-5 pt-4">
            <SectionHeader title="Per-Pair Breakdown" />
          </div>
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
