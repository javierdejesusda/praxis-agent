"use client";

import { Fragment, useState } from "react";

import { useTrades } from "@/lib/hooks";
import type { Artifact } from "@/lib/api";
import { NumericValue } from "@/components/ui/NumericValue";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";
import { KeyValueGrid } from "@/components/ui/KeyValueGrid";
import { fmtHashShort, fmtTimestamp } from "@/lib/format";

type TradePayload = Artifact["payload"] & {
  intent?: {
    intent_id: string;
    pair: string;
    side: string;
    size_usd: number;
    analyst_conviction?: number;
  };
  receipt?: {
    status: string;
    fill_price: number;
    order_id?: string;
    fees?: number;
    fee?: number;
  };
  risk_decision?: {
    approved: boolean;
    reason_codes: string[];
    final_size_usd: number;
    drawdown_pct: number;
  };
  analyst?: {
    direction: string;
    conviction: number;
    rationale: string;
    regime_assessment: string;
  };
};

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

function buildDetails(artifact: Artifact) {
  const payload = artifact.payload as TradePayload;
  const intent = payload.intent;
  const receipt = payload.receipt;
  const decision = payload.risk_decision;
  const analyst = payload.analyst;

  const items: Array<{ k: string; v: React.ReactNode }> = [];

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
  const fees = receipt?.fees ?? receipt?.fee;
  if (fees != null) {
    items.push({ k: "Fees", v: <NumericValue value={fees} kind="usd" /> });
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
  if (artifact.hash) {
    items.push({
      k: "Artifact Hash",
      v: <span className="num">{fmtHashShort(artifact.hash, 10)}</span>,
    });
  }

  return items;
}

export function TradesTable() {
  const { data: trades } = useTrades();
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = trades ?? [];

  if (rows.length === 0) {
    return (
      <div className="py-10 text-center text-[12px] text-[color:var(--color-muted)]">
        No trades recorded.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Pair</th>
            <th>Side</th>
            <th className="num">Size USD</th>
            <th className="num">Fill</th>
            <th>Status</th>
            <th>Hash</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((artifact, idx) => {
            const key = artifact.hash || `${artifact.timestamp}-${idx}`;
            const isOpen = expanded === key;
            const payload = artifact.payload as TradePayload;
            const pair = payload.pair || payload.intent?.pair || "—";
            const side = payload.intent?.side;
            const size = payload.intent?.size_usd;
            const fill = payload.receipt?.fill_price;
            const status = payload.receipt?.status;
            const details = buildDetails(artifact);

            return (
              <Fragment key={key}>
                <tr
                  onClick={() => setExpanded(isOpen ? null : key)}
                  style={{ cursor: "pointer" }}
                >
                  <td>
                    <span className="num text-[11px] text-[color:var(--color-ink-soft)]">
                      {fmtTimestamp(artifact.timestamp)}
                    </span>
                  </td>
                  <td>
                    <span className="num text-[color:var(--color-ink)]">{pair}</span>
                  </td>
                  <td>
                    {side ? (
                      <StatusPill tone={sideTone(side)} label={side.toUpperCase()} />
                    ) : (
                      <span className="text-[color:var(--color-muted)]">—</span>
                    )}
                  </td>
                  <td className="num">
                    {size != null ? (
                      <NumericValue value={size} kind="usd" />
                    ) : (
                      <span className="text-[color:var(--color-muted)]">—</span>
                    )}
                  </td>
                  <td className="num">
                    {fill != null ? (
                      <NumericValue value={fill} kind="usd" />
                    ) : (
                      <span className="text-[color:var(--color-muted)]">—</span>
                    )}
                  </td>
                  <td>
                    {status ? (
                      <StatusPill tone={statusTone(status)} label={status.toUpperCase()} />
                    ) : (
                      <span className="text-[color:var(--color-muted)]">—</span>
                    )}
                  </td>
                  <td>
                    <span className="num text-[11px] text-[color:var(--color-muted)]">
                      {fmtHashShort(artifact.hash)}
                    </span>
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        background: "var(--color-paper)",
                        padding: "14px 16px",
                      }}
                    >
                      {details.length > 0 ? (
                        <KeyValueGrid items={details} columns={2} />
                      ) : (
                        <div className="text-[11px] text-[color:var(--color-muted)]">
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
