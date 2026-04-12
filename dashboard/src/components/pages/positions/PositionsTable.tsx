"use client";

import { usePortfolio } from "@/lib/hooks";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { NumericValue } from "@/components/ui/NumericValue";
import { StatusPill } from "@/components/ui/StatusPill";
import { SkeletonRow } from "@/components/ui/Skeleton";

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
    return <span className="text-[color:var(--color-muted)]">—</span>;
  }
  return <NumericValue value={value} kind="usd" />;
}

export function PositionsTable() {
  const { data: portfolio, isLoading } = usePortfolio();

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
            </tr>
          </thead>
          <tbody>
            <SkeletonRow cols={6} />
            <SkeletonRow cols={6} />
            <SkeletonRow cols={6} />
          </tbody>
        </table>
      </div>
    );
  }

  const rows: Row[] = Object.entries(
    (portfolio?.positions ?? {}) as Record<string, Position>,
  );

  const columns: Column<Row>[] = [
    {
      id: "pair",
      header: "Pair",
      accessor: ([pair]) => (
        <span className="num text-[color:var(--color-ink)]">{pair}</span>
      ),
    },
    {
      id: "side",
      header: "Side",
      accessor: ([, pos]) => {
        const side = (pos.side || "").toLowerCase();
        const tone = side === "long" ? "ok" : side === "short" ? "crit" : "neutral";
        return <StatusPill tone={tone} label={(pos.side || "—").toUpperCase()} />;
      },
    },
    {
      id: "size",
      header: "Size USD",
      align: "right",
      accessor: ([, pos]) => <NumericValue value={pos.size_usd} kind="usd" />,
    },
    {
      id: "entry",
      header: "Entry",
      align: "right",
      accessor: ([, pos]) => <NumericValue value={pos.entry_price} kind="usd" />,
    },
    {
      id: "stop",
      header: "ATR Stop",
      align: "right",
      accessor: ([, pos]) => optionalUsd(pos.atr_stop),
    },
    {
      id: "target",
      header: "ATR Target",
      align: "right",
      accessor: ([, pos]) => optionalUsd(pos.atr_target),
    },
  ];

  return (
    <div style={{ maxHeight: 320, overflowY: "auto" }}>
      <DataTable<Row>
        rows={rows}
        columns={columns}
        rowKey={([pair]) => pair}
        emptyLabel="No open positions"
      />
    </div>
  );
}
