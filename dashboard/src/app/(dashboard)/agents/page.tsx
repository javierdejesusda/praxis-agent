"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AgentsLiveStrip } from "@/components/pages/agents/AgentsLiveStrip";
import { PipelineFlow } from "@/components/pages/agents/PipelineFlow";
import { AgentsGrid } from "@/components/pages/agents/AgentsGrid";
import { LlmAnalystSection } from "@/components/pages/agents/LlmAnalystSection";
import { RiskGovernorSection } from "@/components/pages/agents/RiskGovernorSection";

export default function AgentsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Praxis Agent"
        title="Regime-Adaptive Trading Intelligence"
        description="Six deterministic signal agents analyze 16 technical indicators in parallel, a GPT meta-analyst resolves conflicts and calibrates conviction, and a risk governor with 7 kill criteria enforces position limits the LLM can never override."
      />
      <div className="space-y-6">
        <AgentsLiveStrip />
        <HairlineCard>
          <div className="mb-5">
            <h2 className="text-[17px] font-semibold text-[color:var(--color-ink)] tracking-[-0.02em]">
              How Praxis Works
            </h2>
            <p className="text-[13px] text-[color:var(--color-muted)] mt-1 leading-relaxed max-w-3xl">
              Praxis runs two concurrent loops. The strategic loop executes the full analysis pipeline
              every 15 minutes. The protective loop monitors open positions every 60 seconds, enforcing
              trailing stops and kill criteria in real time. Every trade decision flows through the
              complete pipeline below before execution.
            </p>
          </div>
          <PipelineFlow />
          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4 text-[12px] text-[color:var(--color-ink-soft)]">
            <div
              className="rounded-xl px-4 py-3"
              style={{
                background: "rgba(41, 121, 255, 0.04)",
                border: "1px solid rgba(41, 121, 255, 0.10)",
              }}
            >
              <div className="font-semibold text-[color:var(--color-ink)] text-[13px] mb-1">
                Strategic Loop
                <span className="ml-2 text-[10px] font-medium text-[color:var(--color-accent)] uppercase tracking-[0.06em]">
                  Every 15 min
                </span>
              </div>
              Fetches 200+ OHLCV bars, computes 16 indicators via pandas_ta, runs all 6 signal agents
              in parallel, calls GPT for meta-analysis, applies risk gates, and executes or rejects.
            </div>
            <div
              className="rounded-xl px-4 py-3"
              style={{
                background: "rgba(255, 23, 68, 0.04)",
                border: "1px solid rgba(255, 23, 68, 0.10)",
              }}
            >
              <div className="font-semibold text-[color:var(--color-ink)] text-[13px] mb-1">
                Protective Loop
                <span className="ml-2 text-[10px] font-medium text-[color:var(--color-loss)] uppercase tracking-[0.06em]">
                  Every 60 sec
                </span>
              </div>
              Lightweight cycle that checks all 7 kill criteria, updates ATR-based trailing stops,
              and closes positions that hit stop or target levels. Fully deterministic, no LLM.
            </div>
            <div
              className="rounded-xl px-4 py-3"
              style={{
                background: "rgba(0, 200, 83, 0.04)",
                border: "1px solid rgba(0, 200, 83, 0.10)",
              }}
            >
              <div className="font-semibold text-[color:var(--color-ink)] text-[13px] mb-1">
                Dual Execution
                <span className="ml-2 text-[10px] font-medium text-[color:var(--color-gain)] uppercase tracking-[0.06em]">
                  On-chain + Paper
                </span>
              </div>
              Trades scoring {"\u2265"}85 submit EIP-712 signed TradeIntents to the Risk Router on Sepolia
              (ERC-8004). All trades also execute as Kraken paper trades with real spread modeling.
            </div>
          </div>
        </HairlineCard>

        <div>
          <SectionHeader title="Signal Agents" count={6} />
          <p className="text-[12px] text-[color:var(--color-muted)] mb-4 -mt-2 leading-relaxed max-w-2xl">
            Each agent is a pure function: fixed inputs from the feature engine, deterministic scoring logic,
            no state between cycles. Confidence scores are combined by the LLM analyst but never inflated.
          </p>
          <AgentsGrid />
        </div>

        <LlmAnalystSection />
        <RiskGovernorSection />
      </div>
    </>
  );
}
