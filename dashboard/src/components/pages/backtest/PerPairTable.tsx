"use client";

import { DataTable, type Column } from "@/components/ui/DataTable";
import { NumericValue } from "@/components/ui/NumericValue";
import { Skeleton } from "@/components/ui/Skeleton";
import { useBacktestReport } from "@/lib/hooks";
import type { BacktestReport } from "@/lib/api";

type PerPairRow = NonNullable<BacktestReport["per_pair"]>[number];

export function PerPairTable() {
  const { data, isLoading } = useBacktestReport();
  const rows: PerPairRow[] = data?.per_pair ?? [];

  if (isLoading) {
    return (
      <div className="px-5 pb-4 space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-2">
            <Skeleton width={60} height={12} />
            <Skeleton width={140} height={12} />
            <Skeleton width={40} height={12} />
            <Skeleton width={48} height={12} />
            <Skeleton width={56} height={12} />
            <Skeleton width={40} height={12} />
            <Skeleton width={48} height={12} />
          </div>
        ))}
      </div>
    );
  }

  const hasField = (field: keyof PerPairRow) =>
    rows.some((r) => r[field] != null);

  const columns: Column<PerPairRow>[] = [
    {
      id: "pair",
      header: "Pair",
      accessor: (row) => row.pair,
      align: "left",
    },
    {
      id: "period",
      header: "Period",
      accessor: (row) => (
        <span className="text-[11px] text-[color:var(--color-muted)]">
          {row.period_start ?? "—"} → {row.period_end ?? "—"}
        </span>
      ),
      align: "left",
    },
    {
      id: "trades",
      header: "Trades",
      align: "right",
      sortable: true,
      sortValue: (row) => row.trades,
      accessor: (row) => <NumericValue value={row.trades} kind="int" />,
    },
    {
      id: "win_rate_pct",
      header: "Win %",
      align: "right",
      sortable: true,
      sortValue: (row) => row.win_rate_pct,
      accessor: (row) => (
        <NumericValue
          value={row.win_rate_pct / 100}
          kind="pct"
          decimals={1}
        />
      ),
    },
    {
      id: "return_pct",
      header: "Return %",
      align: "right",
      sortable: true,
      sortValue: (row) => row.return_pct,
      accessor: (row) => (
        <NumericValue
          value={row.return_pct / 100}
          kind="pct"
          color="auto"
          decimals={2}
          sign="always"
        />
      ),
    },
  ];

  if (hasField("profit_factor")) {
    columns.push({
      id: "profit_factor",
      header: "PF",
      align: "right",
      sortable: true,
      sortValue: (row) => row.profit_factor ?? 0,
      accessor: (row) => (
        <NumericValue value={row.profit_factor ?? 0} kind="ratio" decimals={2} />
      ),
    });
  }

  if (hasField("avg_win_pct")) {
    columns.push({
      id: "avg_win_pct",
      header: "Avg Win",
      align: "right",
      sortable: true,
      sortValue: (row) => row.avg_win_pct ?? 0,
      accessor: (row) => (
        <NumericValue
          value={(row.avg_win_pct ?? 0) / 100}
          kind="pct"
          color="auto"
          sign="always"
        />
      ),
    });
  }

  if (hasField("avg_loss_pct")) {
    columns.push({
      id: "avg_loss_pct",
      header: "Avg Loss",
      align: "right",
      sortable: true,
      sortValue: (row) => row.avg_loss_pct ?? 0,
      accessor: (row) => (
        <NumericValue
          value={(row.avg_loss_pct ?? 0) / 100}
          kind="pct"
          color="auto"
          sign="always"
        />
      ),
    });
  }

  if (hasField("max_drawdown_pct")) {
    columns.push({
      id: "max_drawdown_pct",
      header: "Max DD",
      align: "right",
      sortable: true,
      sortValue: (row) => row.max_drawdown_pct ?? 0,
      accessor: (row) => (
        <NumericValue
          value={(row.max_drawdown_pct ?? 0) / 100}
          kind="pct"
          decimals={2}
        />
      ),
    });
  }

  if (hasField("sharpe")) {
    columns.push({
      id: "sharpe",
      header: "Sharpe",
      align: "right",
      sortable: true,
      sortValue: (row) => row.sharpe ?? 0,
      accessor: (row) => (
        <NumericValue value={row.sharpe ?? 0} kind="ratio" decimals={2} />
      ),
    });
  }

  if (hasField("calmar")) {
    columns.push({
      id: "calmar",
      header: "Calmar",
      align: "right",
      sortable: true,
      sortValue: (row) => row.calmar ?? 0,
      accessor: (row) => (
        <NumericValue value={row.calmar ?? 0} kind="ratio" decimals={2} />
      ),
    });
  }

  if (hasField("wins")) {
    columns.push({
      id: "record",
      header: "W / L",
      align: "right",
      accessor: (row) => (
        <span className="text-[12px] text-[color:var(--color-ink-soft)]">
          {row.wins ?? 0} / {row.losses ?? 0}
        </span>
      ),
    });
  }

  return (
    <DataTable<PerPairRow>
      rows={rows}
      columns={columns}
      rowKey={(row) => row.pair}
      emptyLabel="No per-pair data"
    />
  );
}
