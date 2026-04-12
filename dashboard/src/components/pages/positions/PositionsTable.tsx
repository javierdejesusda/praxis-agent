"use client";

import { memo, useMemo } from "react";
import { ChevronRight, Wallet } from "lucide-react";

import { usePortfolio } from "@/lib/hooks";
import { NumericValue } from "@/components/ui/NumericValue";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

type Position = {
  side: string;
  size_usd: number;
  entry_price: number;
  atr_stop?: number;
  atr_target?: number;
  trailing_stop?: number;
  peak_price?: number;
  atr_20?: number;
};

type Row = [string, Position];

function optionalUsd(value: number | undefined) {
  if (value == null) {
    return <span className="text-[color:var(--color-muted)]">\u2014</span>;
  }
  return <NumericValue value={value} kind="usd" />;
}

function sideTone(side: string | undefined): PillTone {
  const s = (side || "").toLowerCase();
  if (s === "long") return "ok";
  if (s === "short") return "crit";
  return "neutral";
}

function PositionsTableImpl() {
  const { data: portfolio, isLoading } = usePortfolio();

  const rows: Row[] = useMemo(
    () =>
      Object.entries(
        (portfolio?.positions ?? {}) as Record<string, Position>,
      ),
    [portfolio?.positions],
  );

  if (isLoading && !portfolio) {
    return (
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Pair</th>
              <th>Side</th>
              <th className="num">Size USD</th>
              <th className="num">Entry</th>
              <th className="num">ATR Stop</th>
              <th className="num">ATR Target</th>
              <th aria-hidden="true" style={{ width: 28 }} />
            </tr>
          </thead>
          <tbody>
            <SkeletonRow cols={7} />
            <SkeletonRow cols={7} />
            <SkeletonRow cols={7} />
            <SkeletonRow cols={7} />
          </tbody>
        </table>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Wallet size={16} strokeWidth={2} />}
        label="No open positions"
        sub="Waiting for next signal approval."
      />
    );
  }

  return (
    <div style={{ maxHeight: 320, overflowY: "auto" }}>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Pair</th>
              <th>Side</th>
              <th className="num">Size USD</th>
              <th className="num">Entry</th>
              <th className="num">ATR Stop</th>
              <th className="num">ATR Target</th>
              <th aria-hidden="true" style={{ width: 28 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map(([pair, pos]) => (
              <tr
                key={pair}
                className="cursor-pointer outline-none focus-visible:ring-2 position-row"
                style={{
                  transition:
                    "background 150ms ease, box-shadow 150ms ease",
                }}
              >
                <td>
                  <span className="num text-[color:var(--color-ink)]">
                    {pair}
                  </span>
                </td>
                <td>
                  <StatusPill
                    tone={sideTone(pos.side)}
                    label={(pos.side || "\u2014").toUpperCase()}
                  />
                </td>
                <td className="num">
                  <NumericValue value={pos.size_usd} kind="usd" />
                </td>
                <td className="num">
                  <NumericValue value={pos.entry_price} kind="usd" />
                </td>
                <td className="num">{optionalUsd(pos.atr_stop)}</td>
                <td className="num">{optionalUsd(pos.atr_target)}</td>
                <td
                  aria-hidden="true"
                  style={{ color: "var(--color-muted-soft)" }}
                >
                  <ChevronRight size={14} strokeWidth={2} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <style jsx>{`
        .position-row:hover {
          background: var(--color-hover);
          box-shadow: inset 0 0 0 1px var(--color-rule-strong);
        }
      `}</style>
    </div>
  );
}

export const PositionsTable = memo(PositionsTableImpl);
