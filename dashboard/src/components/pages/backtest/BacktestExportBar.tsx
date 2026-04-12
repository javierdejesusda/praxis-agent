"use client";

import {FileJson, FileSpreadsheet} from "lucide-react";
import {toast} from "sonner";
import {useBacktestReport} from "@/lib/hooks";
import type {BacktestReport} from "@/lib/api";

const BUTTON_BASE_CLASSES =
  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 " +
  "text-[11px] font-medium uppercase tracking-[0.08em] transition-colors " +
  "duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

type PerPairRow = NonNullable<BacktestReport["per_pair"]>[number];

const CSV_COLUMNS: Array<{
  key: keyof PerPairRow;
  header: string;
}> = [
  {key: "pair", header: "pair"},
  {key: "period_start", header: "period_start"},
  {key: "period_end", header: "period_end"},
  {key: "trades", header: "trades"},
  {key: "wins", header: "wins"},
  {key: "losses", header: "losses"},
  {key: "win_rate_pct", header: "win_rate_pct"},
  {key: "return_pct", header: "return_pct"},
  {key: "profit_factor", header: "profit_factor"},
  {key: "sharpe", header: "sharpe"},
  {key: "calmar", header: "calmar"},
  {key: "max_drawdown_pct", header: "max_drawdown_pct"},
  {key: "avg_win_pct", header: "avg_win_pct"},
  {key: "avg_loss_pct", header: "avg_loss_pct"},
];

function fileTimestamp(value: string | undefined): string {
  const source = value ?? new Date().toISOString();
  const d = new Date(source);
  const iso = Number.isFinite(d.getTime())
    ? d.toISOString()
    : new Date().toISOString();
  return iso.slice(0, 19).replace(/[:T]/g, "-");
}

function escapeCsvCell(cell: unknown): string {
  if (cell == null) return "";
  const s = typeof cell === "string" ? cell : String(cell);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsv(rows: PerPairRow[]): string {
  const header = CSV_COLUMNS.map((c) => c.header).join(",");
  const body = rows
    .map((row) =>
      CSV_COLUMNS.map((c) => escapeCsvCell(row[c.key])).join(","),
    )
    .join("\n");
  return `${header}\n${body}\n`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function BacktestExportBar() {
  const {data} = useBacktestReport();
  const available = Boolean(data?.available);
  const hasRows = available && (data?.per_pair?.length ?? 0) > 0;
  const disabledTitle = available ? undefined : "No backtest data";

  const handleExportJson = () => {
    if (!data || !available) return;
    const payload = JSON.stringify(data, null, 2);
    const blob = new Blob([payload], {type: "application/json"});
    const filename = `praxis-backtest-${fileTimestamp(data.generated_at)}.json`;
    downloadBlob(blob, filename);
    toast.success(`Exported ${filename}`);
  };

  const handleExportCsv = () => {
    if (!data || !available) return;
    const rows = data.per_pair ?? [];
    if (rows.length === 0) {
      toast.error("No per-pair rows to export");
      return;
    }
    const csv = buildCsv(rows);
    const blob = new Blob([csv], {type: "text/csv;charset=utf-8"});
    const filename = `praxis-backtest-${fileTimestamp(data.generated_at)}.csv`;
    downloadBlob(blob, filename);
    toast.success(`Exported ${filename}`);
  };

  const onEnter = (e: React.MouseEvent<HTMLButtonElement>, enabled: boolean) => {
    if (!enabled) return;
    e.currentTarget.style.background = "var(--color-hover)";
    e.currentTarget.style.color = "var(--color-ink)";
  };
  const onLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = "var(--color-surface)";
    e.currentTarget.style.color = "var(--color-ink-soft)";
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="toolbar"
      aria-label="Backtest export actions"
    >
      <button
        type="button"
        onClick={handleExportJson}
        disabled={!available}
        title={disabledTitle}
        aria-label="Export full backtest report as JSON"
        className={BUTTON_BASE_CLASSES}
        style={{
          background: "var(--color-surface)",
          color: "var(--color-ink-soft)",
          borderColor: "var(--color-rule)",
        }}
        onMouseEnter={(e) => onEnter(e, available)}
        onMouseLeave={onLeave}
      >
        <FileJson size={14} strokeWidth={2} aria-hidden="true" />
        <span>Export JSON</span>
      </button>
      <button
        type="button"
        onClick={handleExportCsv}
        disabled={!hasRows}
        title={
          !available
            ? "No backtest data"
            : hasRows
              ? undefined
              : "No per-pair rows"
        }
        aria-label="Export per-pair metrics as CSV"
        className={BUTTON_BASE_CLASSES}
        style={{
          background: "var(--color-surface)",
          color: "var(--color-ink-soft)",
          borderColor: "var(--color-rule)",
        }}
        onMouseEnter={(e) => onEnter(e, hasRows)}
        onMouseLeave={onLeave}
      >
        <FileSpreadsheet size={14} strokeWidth={2} aria-hidden="true" />
        <span>Export CSV</span>
      </button>
    </div>
  );
}
