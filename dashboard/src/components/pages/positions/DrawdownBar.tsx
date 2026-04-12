"use client";

import { memo, useMemo } from "react";

import { usePortfolio } from "@/lib/hooks";
import { NumericValue } from "@/components/ui/NumericValue";

const MAX_DRAWDOWN = 0.08;

function DrawdownBarImpl() {
  const { data: portfolio } = usePortfolio();
  const drawdown = portfolio?.drawdown_pct ?? 0;

  const { widthPct, barColor } = useMemo(() => {
    const ratio = Math.max(0, Math.min(1, drawdown / MAX_DRAWDOWN));
    const color =
      ratio < 0.4
        ? "var(--color-gain)"
        : ratio < 0.7
          ? "var(--color-warn)"
          : "var(--color-loss)";
    return { widthPct: ratio * 100, barColor: color };
  }, [drawdown]);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-muted)] font-medium">
          Current / Cap
        </span>
        <span className="num text-[12px] text-[color:var(--color-ink)]">
          <NumericValue value={drawdown} kind="pct" />
          <span className="text-[color:var(--color-muted)]"> / 8.00%</span>
        </span>
      </div>
      <div
        className="relative h-2.5 w-full rounded-full"
        style={{ background: "var(--color-rule)" }}
      >
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${widthPct}%`,
            background: barColor,
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

export const DrawdownBar = memo(DrawdownBarImpl);
