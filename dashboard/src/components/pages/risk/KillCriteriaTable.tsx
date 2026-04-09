"use client";

import { useKillCriteria, usePortfolio } from "@/lib/hooks";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { NumericValue } from "@/components/ui/NumericValue";
import { StatusPill } from "@/components/ui/StatusPill";

const STALE_DATA_SECONDS = 7200;
const MAX_DAILY_LOSS_PCT = 0.03;
const MAX_DRAWDOWN_PCT = 0.08;
const MIN_SPREAD_BPS = 20;
const MAX_CONSECUTIVE_LOSSES = 3;

type Row = {
  id: string;
  criterion: string;
  threshold: string;
  current: React.ReactNode;
  tripped: boolean;
};

function formatStaleWindow(seconds: number): string {
  const hours = seconds / 3600;
  if (Number.isInteger(hours)) return `\u2264 ${hours}h`;
  return `\u2264 ${seconds}s`;
}

export function KillCriteriaTable() {
  const { data: kill } = useKillCriteria();
  const { data: portfolio } = usePortfolio();

  const dailyPnlRatio =
    portfolio && portfolio.equity > 0 ? portfolio.daily_pnl / portfolio.equity : null;

  const rows: Row[] = [
    {
      id: "stale_data",
      criterion: "Data Freshness",
      threshold: formatStaleWindow(STALE_DATA_SECONDS),
      current: "\u2014",
      tripped: Boolean(kill?.stale_data),
    },
    {
      id: "malformed_output",
      criterion: "Output Integrity",
      threshold: "Valid schema",
      current: "\u2014",
      tripped: Boolean(kill?.malformed_output),
    },
    {
      id: "ledger_mismatch",
      criterion: "Ledger Match",
      threshold: "Internal \u2261 Exchange",
      current: "\u2014",
      tripped: Boolean(kill?.ledger_mismatch),
    },
    {
      id: "spread_too_wide",
      criterion: "Spread",
      threshold: `\u2264 ${MIN_SPREAD_BPS} bps`,
      current: "\u2014",
      tripped: Boolean(kill?.spread_too_wide),
    },
    {
      id: "daily_loss_breached",
      criterion: "Daily Loss Cap",
      threshold: (MAX_DAILY_LOSS_PCT * 100).toFixed(2) + "%",
      current:
        dailyPnlRatio !== null ? (
          <NumericValue value={dailyPnlRatio} kind="pct" />
        ) : (
          "\u2014"
        ),
      tripped: Boolean(kill?.daily_loss_breached),
    },
    {
      id: "max_drawdown_breached",
      criterion: "Max Drawdown",
      threshold: (MAX_DRAWDOWN_PCT * 100).toFixed(2) + "%",
      current:
        portfolio !== undefined ? (
          <NumericValue value={portfolio.drawdown_pct} kind="pct" />
        ) : (
          "\u2014"
        ),
      tripped: Boolean(kill?.max_drawdown_breached),
    },
    {
      id: "kill_switch",
      criterion: "Kill Switch",
      threshold: "Manual override off",
      current: "\u2014",
      tripped: Boolean(kill?.kill_switch),
    },
  ];

  // Suppress unused-constant warnings — MAX_CONSECUTIVE_LOSSES is documented
  // here intentionally alongside the other config thresholds even though the
  // current backend KillCriteria payload does not expose a dedicated row.
  void MAX_CONSECUTIVE_LOSSES;

  const columns: Column<Row>[] = [
    {
      id: "criterion",
      header: "Criterion",
      accessor: (r) => r.criterion,
      align: "left",
    },
    {
      id: "threshold",
      header: "Threshold",
      accessor: (r) => <span className="num">{r.threshold}</span>,
      align: "left",
    },
    {
      id: "current",
      header: "Current",
      accessor: (r) => r.current,
      align: "right",
    },
    {
      id: "status",
      header: "Status",
      accessor: (r) => (
        <StatusPill tone={r.tripped ? "crit" : "ok"} label={r.tripped ? "TRIP" : "OK"} />
      ),
      align: "right",
    },
  ];

  return <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} />;
}
