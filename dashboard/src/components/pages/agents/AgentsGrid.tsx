"use client";

import { memo, useMemo } from "react";

import { useLatestSignals } from "@/lib/hooks";
import { AgentCard, type AgentInfo } from "./AgentCard";

const AGENTS: AgentInfo[] = [
  {
    name: "Trend",
    description:
      "Multi-timeframe EMA alignment with momentum confirmation. Detects sustained directional moves by checking whether short, medium, and long EMAs are stacked in order.",
    inputs: ["EMA 9/21/55/200", "ADX 14", "MACD", "Volume ratio", "RSI"],
    logic:
      "Full bullish alignment (EMA9 > 21 > 55 > 200) with ADX > 22 starts at 40% confidence. MACD acceleration adds +15, volume surge +10, engulfing patterns +10. RSI exhaustion (>78) penalizes by 60%.",
  },
  {
    name: "Volatility",
    description:
      "Regime detection and volatility shock warning. Adjusts confidence based on whether the market is trending or ranging and flags dangerous ATR spikes.",
    inputs: ["ATR/EMA ratio", "ADX", "RSI", "Bollinger Bands", "Regime"],
    logic:
      "ATR > 5% of price triggers -30 confidence (shock). In ranging regime, oversold conditions (RSI < 40, BB < 0.30) signal mean-reversion long. In trending, follows EMA alignment with ADX confirmation.",
  },
  {
    name: "Spread / Cost",
    description:
      "Liquidity gating and cost-benefit analysis. Ensures the expected price move exceeds real trading costs before allowing any trade through.",
    inputs: ["Bid-ask spread", "ATR (expected move)", "Volume ratio"],
    logic:
      "Hard gate: spread > 20 bps = instant rejection (0% confidence). Expected move must exceed 60.5 bps (55 bps round-trip x 1.1). Low volume (<0.5x avg) halves confidence.",
  },
  {
    name: "Mean Reversion",
    description:
      "Oversold/overbought oscillation trades. Active only in ranging or transition regimes, catches rubber-band snaps when price stretches too far from the mean.",
    inputs: ["Bollinger Band position", "RSI 14", "Regime", "Volume"],
    logic:
      "Only fires in ranging/transition regimes. BB < 0.25 AND RSI < 40 = long (base 30). Extreme readings (BB < 0.10, RSI < 28) add +20/+15. Volume capitulation (>1.5x) adds +10.",
  },
  {
    name: "Momentum",
    description:
      "Multi-timeframe return alignment across 1-bar, 5-bar, and 20-bar periods. Confirms that price is accelerating in a consistent direction.",
    inputs: ["Returns 1/5/20 bar", "ADX", "MACD", "Volume", "RSI"],
    logic:
      "All three return periods positive + ADX > 20 = long at 35%. MACD histogram agreement adds +15, slope acceleration +10. ADX > 30 adds +10. RSI exhaustion penalizes by 60%.",
  },
  {
    name: "Swing Structure",
    description:
      "Full price action alignment with multi-indicator confirmation. The strictest signal \u2014 requires complete EMA stack, returns, MACD, ADX, and volume to agree.",
    inputs: ["Full EMA stack", "Returns 5/20", "MACD", "ADX", "Volume"],
    logic:
      "Full EMA alignment + positive returns = base 40%. MACD confirmation (histogram > 0, slope > 0) adds +15. ADX > 25 adds +10. Volume > 1.2x adds +10. RSI exhaustion penalizes by 70%.",
  },
];

const AGENT_NAME_MAP: Record<string, string> = {
  trend: "Trend",
  volatility: "Volatility",
  spread_cost: "Spread / Cost",
  mean_reversion: "Mean Reversion",
  momentum: "Momentum",
  swing_structure: "Swing Structure",
};

function AgentsGridImpl() {
  const { data } = useLatestSignals();
  const signals = data?.signals;
  const timestamp = data?.timestamp ?? "";

  const byAgent = useMemo(() => {
    const out: Record<
      string,
      { direction: string; confidence: number; decisionId: string }
    > = {};
    if (!signals) return out;
    for (const s of signals) {
      const mapped = AGENT_NAME_MAP[s.agent_name] || s.agent_name;
      // Decision id per agent is a stable key derived from the cycle
      // timestamp plus the agent name + confidence so that identical
      // rebroadcasts don't retrigger the pulse but real updates do.
      out[mapped] = {
        direction: s.direction,
        confidence: s.confidence,
        decisionId: `${timestamp}|${mapped}|${s.direction}|${s.confidence}`,
      };
    }
    return out;
  }, [signals, timestamp]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {AGENTS.map((agent) => {
        const sig = byAgent[agent.name];
        return (
          <AgentCard
            key={agent.name}
            agent={agent}
            direction={sig?.direction}
            confidence={sig?.confidence}
            decisionId={sig?.decisionId ?? null}
          />
        );
      })}
    </div>
  );
}

export const AgentsGrid = memo(AgentsGridImpl);
