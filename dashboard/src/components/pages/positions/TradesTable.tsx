"use client";

import { Fragment, useState } from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

import { useTrades } from "@/lib/hooks";
import type { Artifact } from "@/lib/api";
import { NumericValue } from "@/components/ui/NumericValue";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";
import { KeyValueGrid } from "@/components/ui/KeyValueGrid";
import { fmtHashShort, fmtTimestamp } from "@/lib/format";

function sideTone(side: string | undefined): PillTone {
  const s = (side || "").toLowerCase();
  if (s === "long" || s === "buy") return "ok";
  if (s === "short" || s === "sell") return "crit";
  return "neutral";
}

function statusTone(status: string | undefined): PillTone {
  const s = (status || "").toLowerCase();
  if (s === "filled" || s === "approved") return "ok";
  if (s === "rejected" || s === "failed") return "crit";
  if (s === "pending") return "warn";
  return "neutral";
}

function isCloseArtifact(artifact: Artifact): boolean {
  return artifact.type === "position-close";
}

function buildDetails(artifact: Artifact) {
  const payload = artifact.payload;
  const intent = payload.intent;
  const receipt = payload.receipt;
  const decision = payload.risk_decision;
  const analyst = payload.analyst;
  const isClose = isCloseArtifact(artifact);

  const items: Array<{ k: string; v: React.ReactNode }> = [];

  if (isClose) {
    const p = payload as Record<string, unknown>;
    if (p.entry_price != null) {
      items.push({
        k: "Entry Price",
        v: <NumericValue value={p.entry_price as number} kind="usd" />,
      });
    }
    if (p.exit_price != null) {
      items.push({
        k: "Exit Price",
        v: <NumericValue value={p.exit_price as number} kind="usd" />,
      });
    }
    if (p.pnl_usd != null) {
      items.push({
        k: "P&L",
        v: <NumericValue value={p.pnl_usd as number} kind="usd" color="auto" sign="always" />,
      });
    }
    if (p.pnl_pct != null) {
      items.push({
        k: "Return",
        v: <NumericValue value={p.pnl_pct as number} kind="pct" color="auto" sign="always" />,
      });
    }
    if (p.close_reason) {
      items.push({
        k: "Close Reason",
        v: (
          <span className="uppercase tracking-[0.06em] text-[color:var(--color-ink-soft)]">
            {String(p.close_reason).replace(/_/g, " ")}
          </span>
        ),
      });
    }
  } else {
    if (intent?.intent_id) {
      items.push({
        k: "Intent ID",
        v: <span className="num">{fmtHashShort(intent.intent_id, 8)}</span>,
      });
    }
    if (receipt?.fill_price != null) {
      items.push({
        k: "Fill Price",
        v: <NumericValue value={receipt.fill_price} kind="usd" />,
      });
    }
    if (receipt?.fees_usd != null) {
      items.push({
        k: "Fees",
        v: <NumericValue value={receipt.fees_usd} kind="usd" />,
      });
    }
    if (receipt?.status) {
      items.push({
        k: "Receipt Status",
        v: <span className="uppercase tracking-[0.06em]">{receipt.status}</span>,
      });
    }
    if (receipt?.order_id) {
      items.push({
        k: "Order ID",
        v: <span className="num">{fmtHashShort(receipt.order_id, 8)}</span>,
      });
    }
    if (decision?.final_size_usd != null) {
      items.push({
        k: "Final Size",
        v: <NumericValue value={decision.final_size_usd} kind="usd" />,
      });
    }
    if (decision?.drawdown_pct != null) {
      items.push({
        k: "Drawdown",
        v: <NumericValue value={decision.drawdown_pct} kind="pct" />,
      });
    }
    if (decision?.reason_codes && decision.reason_codes.length > 0) {
      items.push({
        k: "Reason Codes",
        v: (
          <span className="text-[color:var(--color-ink-soft)]">
            {decision.reason_codes.join(", ")}
          </span>
        ),
      });
    }
    if (analyst?.conviction != null) {
      items.push({
        k: "Analyst Conviction",
        v: <NumericValue value={analyst.conviction} kind="int" />,
      });
    }
    if (analyst?.regime_assessment) {
      items.push({
        k: "Regime",
        v: (
          <span className="uppercase tracking-[0.06em] text-[color:var(--color-ink-soft)]">
            {analyst.regime_assessment}
          </span>
        ),
      });
    }
  }

  if (artifact.hash) {
    items.push({
      k: "Artifact Hash",
      v: <span className="num">{fmtHashShort(artifact.hash, 10)}</span>,
    });
  }

  return items;
}

function TypeBadge({ isClose }: { isClose: boolean }) {
  if (isClose) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-[0.04em] text-white"
        style={{ background: "#FF9100" }}
      >
        <ArrowDownRight size={14} strokeWidth={2.5} />
        EXIT
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-[0.04em] text-white"
      style={{ background: "#2979FF" }}
    >
      <ArrowUpRight size={14} strokeWidth={2.5} />
      ENTRY
    </span>
  );
}

export function TradesTable() {
  const { data: trades } = useTrades();
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = trades ?? [];

  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-[13px] text-[color:var(--color-muted)]">
        No trades recorded.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Time</th>
            <th>Pair</th>
            <th>Side</th>
            <th className="num">Size USD</th>
            <th className="num">Price</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((artifact, idx) => {
            const key = artifact.hash || `${artifact.timestamp}-${idx}`;
            const isOpen = expanded === key;
            const payload = artifact.payload;
            const isClose = isCloseArtifact(artifact);
            const p = payload as Record<string, unknown>;

            const pair = isClose
              ? (p.pair as string) || "\u2014"
              : payload.pair || payload.intent?.pair || "\u2014";

            const side = isClose
              ? (p.side as string | undefined)
              : payload.intent?.side;

            const size = isClose
              ? (p.size_usd as number | undefined)
              : payload.intent?.size_usd;

            const price = isClose
              ? (p.exit_price as number | undefined)
              : payload.receipt?.fill_price;

            const status = isClose
              ? "closed"
              : payload.receipt?.status;

            const pnlUsd = isClose ? (p.pnl_usd as number | undefined) : undefined;
            const details = buildDetails(artifact);

            const rowBg = isClose
              ? "rgba(255, 145, 0, 0.06)"
              : "rgba(41, 121, 255, 0.04)";

            const borderLeft = isClose
              ? "4px solid #FF9100"
              : "4px solid #2979FF";

            return (
              <Fragment key={key}>
                <tr
                  onClick={() => setExpanded(isOpen ? null : key)}
                  className="cursor-pointer"
                  style={{ background: rowBg }}
                >
                  <td style={{ borderLeft, paddingLeft: 12 }}>
                    <TypeBadge isClose={isClose} />
                  </td>
                  <td>
                    <span className="num text-[12px] text-[color:var(--color-ink)]">
                      {fmtTimestamp(artifact.timestamp)}
                    </span>
                  </td>
                  <td>
                    <span className="num font-medium text-[13px] text-[color:var(--color-ink)]">
                      {pair}
                    </span>
                  </td>
                  <td>
                    {side ? (
                      <StatusPill tone={sideTone(side)} label={side.toUpperCase()} />
                    ) : (
                      <span className="text-[color:var(--color-muted)]">{"\u2014"}</span>
                    )}
                  </td>
                  <td className="num">
                    {size != null ? (
                      <NumericValue value={size} kind="usd" />
                    ) : (
                      <span className="text-[color:var(--color-muted)]">{"\u2014"}</span>
                    )}
                  </td>
                  <td className="num">
                    {price != null ? (
                      <NumericValue value={price} kind="usd" />
                    ) : (
                      <span className="text-[color:var(--color-muted)]">{"\u2014"}</span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      {status ? (
                        <StatusPill
                          tone={isClose ? "warn" : statusTone(status)}
                          label={status.toUpperCase()}
                        />
                      ) : (
                        <span className="text-[color:var(--color-muted)]">{"\u2014"}</span>
                      )}
                      {pnlUsd != null && (
                        <NumericValue
                          value={pnlUsd}
                          kind="usd"
                          color="auto"
                          sign="always"
                          className="text-[13px] font-semibold"
                        />
                      )}
                    </div>
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        background: "var(--color-paper)",
                        padding: "16px 20px",
                        borderLeft,
                      }}
                    >
                      {details.length > 0 ? (
                        <KeyValueGrid items={details} columns={2} />
                      ) : (
                        <div className="text-[12px] text-[color:var(--color-muted)]">
                          No detail payload available.
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
