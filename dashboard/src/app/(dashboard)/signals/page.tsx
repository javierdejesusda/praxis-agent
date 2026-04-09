"use client";
import { PageHeader } from "@/components/ui/PageHeader";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SignalGrid } from "@/components/pages/signals/SignalGrid";
import { AnalystBlock } from "@/components/pages/signals/AnalystBlock";
import { RiskDecisionBlock } from "@/components/pages/signals/RiskDecisionBlock";
import { PrismRow } from "@/components/pages/signals/PrismRow";

export default function SignalsPage() {
  return (
    <>
      <PageHeader eyebrow="Pipeline" title="Signals & Analysis" description="Agent outputs, LLM analyst, and risk decision for the latest cycle." />
      <div className="space-y-5">
        <HairlineCard padded={false}>
          <div className="px-4 pt-3"><SectionHeader title="Agent Signals" /></div>
          <SignalGrid />
        </HairlineCard>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <AnalystBlock />
          <RiskDecisionBlock />
        </div>
        <PrismRow />
      </div>
    </>
  );
}
