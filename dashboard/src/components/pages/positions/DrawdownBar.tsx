"use client";

import { usePortfolio } from "@/lib/hooks";
import { NumericValue } from "@/components/ui/NumericValue";
import { colors } from "@/lib/tokens";

const MAX_DRAWDOWN = 0.08;

export function DrawdownBar() {
  const { data: portfolio } = usePortfolio();
  const drawdown = portfolio?.drawdown_pct ?? 0;
  const ratio = Math.max(0, Math.min(1, drawdown / MAX_DRAWDOWN));
  const widthPct = ratio * 100;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-muted)]">
          Current / Cap
        </span>
        <span className="num text-[12px] text-[color:var(--color-ink)]">
          <NumericValue value={drawdown} kind="pct" />
          <span className="text-[color:var(--color-muted)]"> / 8.00%</span>
        </span>
      </div>
      <div
        className="relative h-2 w-full"
        style={{ background: colors.ruleStrong, borderRadius: 1 }}
      >
        <div
          className="absolute left-0 top-0 h-full"
          style={{
            width: `${widthPct}%`,
            background: colors.loss,
            borderRadius: 1,
          }}
        />
      </div>
      <div className="flex items-baseline justify-between text-[10px] text-[color:var(--color-muted-soft)]">
        <span className="num">0.00%</span>
        <span className="num">8.00%</span>
      </div>
    </div>
  );
}
