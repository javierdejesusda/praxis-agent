"use client";

import dynamic from "next/dynamic";

import { PageHeader } from "@/components/ui/PageHeader";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SkeletonChart } from "@/components/ui/Skeleton";

const SignalGrid = dynamic(
  () =>
    import("@/components/pages/signals/SignalGrid").then((m) => ({
      default: m.SignalGrid,
    })),
  { ssr: false, loading: () => <SkeletonChart height={240} /> },
);
const AnalystBlock = dynamic(
  () =>
    import("@/components/pages/signals/AnalystBlock").then((m) => ({
      default: m.AnalystBlock,
    })),
  { ssr: false, loading: () => <SkeletonChart height={220} /> },
);
const RiskDecisionBlock = dynamic(
  () =>
    import("@/components/pages/signals/RiskDecisionBlock").then((m) => ({
      default: m.RiskDecisionBlock,
    })),
  { ssr: false, loading: () => <SkeletonChart height={220} /> },
);
const PrismRow = dynamic(
  () =>
    import("@/components/pages/signals/PrismRow").then((m) => ({
      default: m.PrismRow,
    })),
  { ssr: false, loading: () => <SkeletonChart height={160} /> },
);

export default function SignalsPage() {
  return (
    <>
      <PageHeader eyebrow="Pipeline" title="Signals & Analysis" description="Agent outputs, LLM analyst, and risk decision for the latest cycle." />
      <div className="space-y-6">
        <HairlineCard padded={false}>
          <div className="px-5 pt-4"><SectionHeader title="Agent Signals" /></div>
          <SignalGrid />
        </HairlineCard>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AnalystBlock />
          <RiskDecisionBlock />
        </div>
        <PrismRow />
      </div>
    </>
  );
}
