"use client";

import { DataTable, type Column } from "@/components/ui/DataTable";
import { NumericValue } from "@/components/ui/NumericValue";
import { useBacktestReport } from "@/lib/hooks";
import type { BacktestReport } from "@/lib/api";

type PerPairRow = NonNullable<BacktestReport["per_pair"]>[number];

export function PerPairTable() {
  const { data } = useBacktestReport();
  const rows: PerPairRow[] = data?.per_pair ?? [];

  const columns: Column<PerPairRow>[] = [
    {
      id: "pair",
      header: "Pair",
      accessor: (row) => row.pair,
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
        />
      ),
    },
    {
      id: "profit_factor",
      header: "PF",
      align: "right",
      sortable: true,
      sortValue: (row) => row.profit_factor,
      accessor: (row) => (
        <NumericValue value={row.profit_factor} kind="ratio" decimals={2} />
      ),
    },
    {
      id: "max_drawdown_pct",
      header: "Max DD",
      align: "right",
      sortable: true,
      sortValue: (row) => row.max_drawdown_pct,
      accessor: (row) => (
        <NumericValue
          value={row.max_drawdown_pct / 100}
          kind="pct"
          decimals={2}
        />
      ),
    },
    {
      id: "sharpe",
      header: "Sharpe",
      align: "right",
      sortable: true,
      sortValue: (row) => row.sharpe,
      accessor: (row) => (
        <NumericValue value={row.sharpe} kind="ratio" decimals={2} />
      ),
    },
    {
      id: "calmar",
      header: "Calmar",
      align: "right",
      sortable: true,
      sortValue: (row) => row.calmar,
      accessor: (row) => (
        <NumericValue value={row.calmar} kind="ratio" decimals={2} />
      ),
    },
    {
      id: "avg_win_pct",
      header: "Avg Win",
      align: "right",
      sortable: true,
      sortValue: (row) => row.avg_win_pct,
      accessor: (row) => (
        <NumericValue value={row.avg_win_pct / 100} kind="pct" />
      ),
    },
    {
      id: "avg_loss_pct",
      header: "Avg Loss",
      align: "right",
      sortable: true,
      sortValue: (row) => row.avg_loss_pct,
      accessor: (row) => (
        <NumericValue
          value={row.avg_loss_pct / 100}
          kind="pct"
          color="auto"
        />
      ),
    },
  ];

  return (
    <DataTable<PerPairRow>
      rows={rows}
      columns={columns}
      rowKey={(row) => row.pair}
      emptyLabel="No per-pair data"
    />
  );
}
