"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, X } from "lucide-react";

import type { Artifact } from "@/lib/api";
import { CopyButton } from "@/components/ui/CopyButton";
import { NumericValue } from "@/components/ui/NumericValue";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";
import { etherscanTx } from "@/lib/chain";
import { formatTimestamp, useTimezoneMode } from "@/lib/timezone";

type Props = {
  artifact: Artifact | null;
  onClose: () => void;
};

function sideTone(side: string | undefined): PillTone {
  const s = (side || "").toLowerCase();
  if (s === "long" || s === "buy") return "ok";
  if (s === "short" || s === "sell") return "crit";
  return "neutral";
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-xl"
      style={{
        padding: "14px 16px",
        border: "1px solid var(--color-rule)",
        background: "var(--color-surface)",
      }}
    >
      <div
        className="text-[10px] uppercase tracking-[0.1em] font-semibold mb-2"
        style={{ color: "var(--color-muted)" }}
      >
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-[12px]">
      <span style={{ color: "var(--color-muted)" }}>{label}</span>
      <span
        className="num text-right"
        style={{ color: "var(--color-ink)" }}
      >
        {children}
      </span>
    </div>
  );
}

export function TradeDetailDrawer({ artifact, onClose }: Props) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const tzMode = useTimezoneMode();

  useEffect(() => {
    if (!artifact) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const id = window.setTimeout(() => closeButtonRef.current?.focus(), 30);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(id);
    };
  }, [artifact, onClose]);

  const payload = artifact?.payload;
  const intent = payload?.intent;
  const receipt = payload?.receipt;
  const decision = payload?.risk_decision;
  const analyst = payload?.analyst;
  const signals = payload?.signals;
  const closeInfo = payload as
    | (Record<string, unknown> & { tx_hash?: string })
    | undefined;
  const txHash =
    (closeInfo?.tx_hash as string | undefined) ??
    ((receipt?.raw_output as Record<string, unknown> | undefined)?.tx_hash as
      | string
      | undefined);

  return (
    <AnimatePresence>
      {artifact && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            aria-hidden="true"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.32)",
              zIndex: 70,
            }}
          />
          <motion.aside
            key="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Trade detail"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="trade-drawer"
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              height: "100vh",
              width: 420,
              maxWidth: "100vw",
              background: "var(--color-surface-solid)",
              borderLeft: "1px solid var(--color-rule-strong)",
              boxShadow: "-8px 0 32px rgba(0,0,0,0.18)",
              zIndex: 80,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <header
              className="flex items-center justify-between"
              style={{
                padding: "14px 16px",
                borderBottom: "1px solid var(--color-rule)",
              }}
            >
              <div className="flex flex-col">
                <span
                  className="text-[10px] uppercase tracking-[0.1em] font-semibold"
                  style={{ color: "var(--color-muted)" }}
                >
                  {artifact.type.replace(/_/g, " ")}
                </span>
                <span
                  className="num text-[12px]"
                  style={{ color: "var(--color-ink)" }}
                >
                  {formatTimestamp(artifact.timestamp, tzMode)}
                </span>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label="Close trade detail"
                className="rounded-md"
                style={{
                  padding: 6,
                  background: "transparent",
                  border: "1px solid var(--color-rule)",
                  color: "var(--color-ink-soft)",
                  cursor: "pointer",
                }}
              >
                <X size={16} strokeWidth={2} />
              </button>
            </header>

            <div
              className="flex-1 overflow-y-auto space-y-3"
              style={{ padding: 16 }}
            >
              {intent && (
                <Section title="Intent">
                  <Row label="Pair">{intent.pair || "—"}</Row>
                  <Row label="Side">
                    {intent.side ? (
                      <StatusPill
                        tone={sideTone(intent.side)}
                        label={intent.side.toUpperCase()}
                      />
                    ) : (
                      "—"
                    )}
                  </Row>
                  <Row label="Size USD">
                    {intent.size_usd != null ? (
                      <NumericValue value={intent.size_usd} kind="usd" />
                    ) : (
                      "—"
                    )}
                  </Row>
                  <Row label="Order Type">
                    {intent.order_type || "—"}
                  </Row>
                  <Row label="Limit Price">
                    {intent.limit_price != null ? (
                      <NumericValue value={intent.limit_price} kind="usd" />
                    ) : (
                      "—"
                    )}
                  </Row>
                  {intent.intent_id && (
                    <Row label="Intent ID">
                      <CopyButton value={intent.intent_id} truncate={14} />
                    </Row>
                  )}
                </Section>
              )}

              {decision && (
                <Section title="Risk Decision">
                  <Row label="Approved">
                    <StatusPill
                      tone={decision.approved ? "ok" : "crit"}
                      label={decision.approved ? "YES" : "NO"}
                    />
                  </Row>
                  <Row label="Final Size">
                    {decision.final_size_usd != null ? (
                      <NumericValue value={decision.final_size_usd} kind="usd" />
                    ) : (
                      "—"
                    )}
                  </Row>
                  <Row label="Exposure Before">
                    {decision.exposure_before != null ? (
                      <NumericValue value={decision.exposure_before} kind="usd" />
                    ) : (
                      "—"
                    )}
                  </Row>
                  <Row label="Exposure After">
                    {decision.exposure_after != null ? (
                      <NumericValue value={decision.exposure_after} kind="usd" />
                    ) : (
                      "—"
                    )}
                  </Row>
                  <Row label="Daily P&L">
                    {decision.daily_pnl != null ? (
                      <NumericValue
                        value={decision.daily_pnl}
                        kind="usd"
                        color="auto"
                        sign="always"
                      />
                    ) : (
                      "—"
                    )}
                  </Row>
                  <Row label="Drawdown">
                    {decision.drawdown_pct != null ? (
                      <NumericValue value={decision.drawdown_pct} kind="pct" />
                    ) : (
                      "—"
                    )}
                  </Row>
                  {decision.reason_codes && decision.reason_codes.length > 0 && (
                    <div className="pt-1">
                      <div
                        className="text-[10px] uppercase tracking-[0.08em] mb-1"
                        style={{ color: "var(--color-muted)" }}
                      >
                        Reason Codes
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {decision.reason_codes.map((c) => (
                          <span
                            key={c}
                            className="text-[10px] px-2 py-0.5 rounded-full"
                            style={{
                              background: "var(--color-hover)",
                              border: "1px solid var(--color-rule)",
                              color: "var(--color-ink-soft)",
                            }}
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </Section>
              )}

              {receipt && (
                <Section title="Receipt">
                  <Row label="Status">
                    <StatusPill
                      tone={
                        receipt.status === "filled"
                          ? "ok"
                          : receipt.status === "rejected"
                            ? "crit"
                            : "neutral"
                      }
                      label={(receipt.status || "—").toUpperCase()}
                    />
                  </Row>
                  <Row label="Fill Price">
                    {receipt.fill_price != null ? (
                      <NumericValue value={receipt.fill_price} kind="usd" />
                    ) : (
                      "—"
                    )}
                  </Row>
                  <Row label="Fees">
                    {receipt.fees_usd != null ? (
                      <NumericValue value={receipt.fees_usd} kind="usd" />
                    ) : (
                      "—"
                    )}
                  </Row>
                  {receipt.order_id && (
                    <Row label="Order ID">
                      <CopyButton value={receipt.order_id} truncate={14} />
                    </Row>
                  )}
                  {receipt.adapter && (
                    <Row label="Adapter">{receipt.adapter}</Row>
                  )}
                  {receipt.error && (
                    <div
                      className="text-[11px] mt-1"
                      style={{ color: "var(--color-loss)" }}
                    >
                      {receipt.error}
                    </div>
                  )}
                </Section>
              )}

              {analyst && (
                <Section title="Analyst Rationale">
                  <Row label="Direction">
                    {analyst.direction?.toUpperCase() || "—"}
                  </Row>
                  <Row label="Conviction">
                    {analyst.conviction != null ? (
                      <NumericValue value={analyst.conviction} kind="int" />
                    ) : (
                      "—"
                    )}
                  </Row>
                  <Row label="Regime">
                    <span className="uppercase tracking-[0.06em]">
                      {analyst.regime_assessment || "—"}
                    </span>
                  </Row>
                  {analyst.rationale && (
                    <div
                      className="text-[12px] leading-relaxed pt-1"
                      style={{ color: "var(--color-ink-soft)" }}
                    >
                      {analyst.rationale}
                    </div>
                  )}
                  {analyst.key_risks && analyst.key_risks.length > 0 && (
                    <div className="pt-1">
                      <div
                        className="text-[10px] uppercase tracking-[0.08em] mb-1"
                        style={{ color: "var(--color-muted)" }}
                      >
                        Key Risks
                      </div>
                      <ul
                        className="text-[11px] space-y-0.5 list-disc pl-4"
                        style={{ color: "var(--color-ink-soft)" }}
                      >
                        {analyst.key_risks.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Section>
              )}

              {signals && signals.length > 0 && (
                <Section title="Signals at Entry">
                  {signals.map((s, i) => (
                    <Row
                      key={`${s.agent_name}-${i}`}
                      label={s.agent_name}
                    >
                      <span
                        style={{
                          color:
                            s.direction?.toLowerCase() === "long"
                              ? "var(--color-gain)"
                              : s.direction?.toLowerCase() === "short"
                                ? "var(--color-loss)"
                                : "var(--color-muted)",
                        }}
                      >
                        {(s.direction || "—").toUpperCase()}
                      </span>
                      <span
                        className="ml-2"
                        style={{ color: "var(--color-muted)" }}
                      >
                        {typeof s.confidence === "number"
                          ? s.confidence.toFixed(0)
                          : "—"}
                      </span>
                    </Row>
                  ))}
                </Section>
              )}

              <Section title="Artifact">
                {artifact.hash && (
                  <Row label="Hash">
                    <CopyButton value={artifact.hash} truncate={14} />
                  </Row>
                )}
                {txHash && (
                  <Row label="Tx Hash">
                    <span className="inline-flex items-center gap-1.5">
                      <CopyButton value={txHash} truncate={12} />
                      <a
                        href={etherscanTx(txHash)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="View on Etherscan"
                        style={{ color: "var(--color-accent)" }}
                      >
                        <ExternalLink size={12} />
                      </a>
                    </span>
                  </Row>
                )}
                <Row label="Agent">{artifact.agent_id || "—"}</Row>
                <Row label="Type">{artifact.type}</Row>
              </Section>
            </div>
          </motion.aside>
          <style jsx>{`
            @media (max-width: 640px) {
              .trade-drawer {
                width: 100vw !important;
              }
            }
          `}</style>
        </>
      )}
    </AnimatePresence>
  );
}
