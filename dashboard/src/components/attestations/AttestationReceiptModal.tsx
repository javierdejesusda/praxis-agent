"use client";

import {useEffect, useMemo, useRef} from "react";
import {AnimatePresence, motion} from "framer-motion";
import {ExternalLink, ShieldCheck, X} from "lucide-react";

import {CopyButton} from "@/components/ui/CopyButton";
import type {Attestation} from "@/lib/api";
import {etherscanTx} from "@/lib/chain";
import {formatTimestamp, useTimezoneMode} from "@/lib/timezone";

import {
  ERC8004_ELIGIBLE_THRESHOLD,
  PAPER_THRESHOLD,
  RISK_ROUTER_ADDRESS,
  RISK_ROUTER_DOMAIN,
} from "./constants";

type ScoreTier = {
  label: string;
  sublabel: string;
  color: string;
  background: string;
  border: string;
};

function tierFor(score: number | undefined): ScoreTier {
  if (score == null) {
    return {
      label: "UNSCORED",
      sublabel: "No validation score recorded",
      color: "var(--color-muted)",
      background: "var(--color-hover)",
      border: "var(--color-rule)",
    };
  }
  if (score >= ERC8004_ELIGIBLE_THRESHOLD) {
    return {
      label: "ERC-8004 ELIGIBLE",
      sublabel: `Score ≥ ${ERC8004_ELIGIBLE_THRESHOLD} — validated on-chain`,
      color: "var(--color-gain)",
      background: "var(--color-gain-soft)",
      border: "var(--color-gain)",
    };
  }
  if (score >= PAPER_THRESHOLD) {
    return {
      label: "PAPER TRADE ONLY",
      sublabel: `Score ${PAPER_THRESHOLD}–${ERC8004_ELIGIBLE_THRESHOLD - 1} — Kraken paper execution`,
      color: "var(--color-warn)",
      background: "var(--color-warn-soft)",
      border: "var(--color-warn)",
    };
  }
  return {
    label: "REJECTED",
    sublabel: `Score < ${PAPER_THRESHOLD} — below execution threshold`,
    color: "var(--color-loss)",
    background: "var(--color-loss-soft)",
    border: "var(--color-loss)",
  };
}

type Props = {
  record: Attestation | null;
  onClose: () => void;
};

export function AttestationReceiptModal({record, onClose}: Props) {
  const tzMode = useTimezoneMode();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!record) return;
    if (previousFocusRef.current == null) {
      previousFocusRef.current =
        (document.activeElement as HTMLElement | null) ?? null;
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function getFocusable(): HTMLElement[] {
      if (!dialogRef.current) return [];
      return Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button, a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"));
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab") {
        const focusable = getFocusable();
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", onKey);
    const id = window.setTimeout(() => closeButtonRef.current?.focus(), 40);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(id);
    };
  }, [record]);

  const handleExitComplete = () => {
    const target = previousFocusRef.current;
    previousFocusRef.current = null;
    if (target && typeof target.focus === "function") {
      target.focus();
    }
  };

  const prettyPayload = useMemo(() => {
    if (!record) return "";
    return JSON.stringify(record, null, 2);
  }, [record]);

  const tier = tierFor(record?.score);

  return (
    <AnimatePresence onExitComplete={handleExitComplete}>
      {record && (
        <motion.div
          key="attestation-backdrop"
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          exit={{opacity: 0}}
          transition={{duration: 0.18}}
          onClick={onClose}
          className="fixed inset-0 z-[90] flex items-center justify-center p-4 backdrop-blur-md bg-black/40 motion-reduce:transition-none"
          role="presentation"
        >
          <motion.div
            key="attestation-dialog"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="attestation-receipt-title"
            initial={{opacity: 0, scale: 0.96}}
            animate={{opacity: 1, scale: 1}}
            exit={{opacity: 0, scale: 0.96}}
            transition={{duration: 0.18, ease: [0.25, 0.1, 0.25, 1]}}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-[640px] max-h-[90vh] overflow-hidden rounded-2xl border shadow-[0_24px_64px_rgba(0,0,0,0.32)] motion-reduce:transition-none"
            style={{
              background: "var(--color-surface-solid)",
              borderColor: "var(--color-rule-strong)",
            }}
          >
            <header
              className="flex items-center justify-between gap-3 px-5 py-4 border-b"
              style={{borderColor: "var(--color-rule)"}}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{
                    background: "var(--color-accent-soft)",
                    color: "var(--color-accent)",
                  }}
                  aria-hidden="true"
                >
                  <ShieldCheck size={18} strokeWidth={2.25} />
                </span>
                <div className="min-w-0">
                  <h2
                    id="attestation-receipt-title"
                    className="text-[14px] font-semibold tracking-[-0.01em]"
                    style={{color: "var(--color-ink)"}}
                  >
                    ERC-8004 Attestation Receipt
                  </h2>
                  <p
                    className="text-[11px] uppercase tracking-[0.08em] mt-0.5"
                    style={{color: "var(--color-muted)"}}
                  >
                    {record.kind.replace("_", " ")} &middot;{" "}
                    {formatTimestamp(record.timestamp, tzMode)}
                  </p>
                </div>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label="Close attestation receipt"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2"
                style={{
                  background: "transparent",
                  borderColor: "var(--color-rule)",
                  color: "var(--color-ink-soft)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--color-hover)";
                  e.currentTarget.style.color = "var(--color-ink)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--color-ink-soft)";
                }}
              >
                <X size={16} strokeWidth={2} />
              </button>
            </header>

            <div
              className="overflow-y-auto"
              style={{maxHeight: "calc(90vh - 80px)"}}
            >
              <section className="px-5 py-4 space-y-4">
                <div
                  className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3"
                  style={{
                    background: tier.background,
                    borderColor: tier.border,
                  }}
                >
                  <div className="min-w-0">
                    <div
                      className="text-[10px] uppercase tracking-[0.12em] font-semibold"
                      style={{color: tier.color}}
                    >
                      {tier.label}
                    </div>
                    <div
                      className="text-[11px] mt-0.5"
                      style={{color: "var(--color-ink-soft)"}}
                    >
                      {tier.sublabel}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className="text-[36px] font-semibold leading-none tabular-nums tracking-[-0.03em]"
                      style={{color: tier.color}}
                    >
                      {record.score != null ? record.score : "—"}
                    </div>
                    <div
                      className="text-[9px] uppercase tracking-[0.12em] mt-1"
                      style={{color: "var(--color-muted)"}}
                    >
                      validation score
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <KeyValue label="Pair" value={record.pair || "—"} />
                  <KeyValue
                    label="Artifact Type"
                    value={record.artifact_type || "—"}
                  />
                  {record.intent_id && (
                    <KeyValue label="Intent ID" value={record.intent_id} />
                  )}
                  {record.side && (
                    <KeyValue label="Side" value={record.side.toUpperCase()} />
                  )}
                  {record.size_usd != null && (
                    <KeyValue
                      label="Size USD"
                      value={`$${record.size_usd.toLocaleString("en-US", {maximumFractionDigits: 2})}`}
                    />
                  )}
                  {record.status && (
                    <KeyValue label="Status" value={record.status} />
                  )}
                </div>

                <div
                  className="rounded-xl border px-4 py-3"
                  style={{
                    background: "var(--color-surface)",
                    borderColor: "var(--color-rule)",
                  }}
                >
                  <div
                    className="text-[10px] uppercase tracking-[0.12em] font-semibold mb-2"
                    style={{color: "var(--color-muted)"}}
                  >
                    EIP-712 domain
                  </div>
                  <dl className="grid grid-cols-[80px_1fr] gap-x-4 gap-y-1 text-[11px]">
                    <dt style={{color: "var(--color-muted)"}}>name</dt>
                    <dd
                      className="num"
                      style={{color: "var(--color-ink)"}}
                    >
                      {RISK_ROUTER_DOMAIN.name}
                    </dd>
                    <dt style={{color: "var(--color-muted)"}}>version</dt>
                    <dd
                      className="num"
                      style={{color: "var(--color-ink)"}}
                    >
                      {RISK_ROUTER_DOMAIN.version}
                    </dd>
                    <dt style={{color: "var(--color-muted)"}}>chainId</dt>
                    <dd
                      className="num"
                      style={{color: "var(--color-ink)"}}
                    >
                      {RISK_ROUTER_DOMAIN.chainId}
                    </dd>
                    <dt style={{color: "var(--color-muted)"}}>contract</dt>
                    <dd>
                      <CopyButton value={RISK_ROUTER_ADDRESS} truncate={14} />
                    </dd>
                  </dl>
                </div>

                <div
                  className="rounded-xl border px-4 py-3"
                  style={{
                    background: "var(--color-surface)",
                    borderColor: "var(--color-rule)",
                  }}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span
                      className="text-[10px] uppercase tracking-[0.12em] font-semibold"
                      style={{color: "var(--color-muted)"}}
                    >
                      Transaction
                    </span>
                    <a
                      href={etherscanTx(record.tx_hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[11px] font-medium cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 rounded-md px-1.5 py-0.5"
                      style={{color: "var(--color-accent)"}}
                    >
                      Verify on Sepolia
                      <ExternalLink size={12} strokeWidth={2} />
                    </a>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className="text-[11px]"
                      style={{color: "var(--color-muted)"}}
                    >
                      txhash
                    </span>
                    <CopyButton value={record.tx_hash} truncate={18} />
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-1">
                    <span
                      className="text-[11px]"
                      style={{color: "var(--color-muted)"}}
                    >
                      artifact hash
                    </span>
                    <CopyButton value={record.artifact_hash} truncate={18} />
                  </div>
                </div>

                <div>
                  <div
                    className="text-[10px] uppercase tracking-[0.12em] font-semibold mb-2"
                    style={{color: "var(--color-muted)"}}
                  >
                    Signed payload
                  </div>
                  <pre
                    className="text-[11px] font-mono leading-relaxed overflow-x-auto rounded-xl border px-4 py-3 max-h-[280px]"
                    style={{
                      background: "var(--color-surface)",
                      borderColor: "var(--color-rule)",
                      color: "var(--color-ink-soft)",
                    }}
                  >
                    {prettyPayload}
                  </pre>
                </div>

                {record.comment && (
                  <div
                    className="rounded-xl border px-4 py-3 text-[12px] leading-relaxed"
                    style={{
                      background: "var(--color-surface)",
                      borderColor: "var(--color-rule)",
                      color: "var(--color-ink-soft)",
                    }}
                  >
                    <div
                      className="text-[10px] uppercase tracking-[0.12em] font-semibold mb-1"
                      style={{color: "var(--color-muted)"}}
                    >
                      Comment
                    </div>
                    {record.comment}
                  </div>
                )}
              </section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function KeyValue({label, value}: {label: string; value: string}) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
      style={{
        background: "var(--color-surface)",
        borderColor: "var(--color-rule)",
      }}
    >
      <span
        className="text-[10px] uppercase tracking-[0.1em]"
        style={{color: "var(--color-muted)"}}
      >
        {label}
      </span>
      <span
        className="text-[11px] num text-right truncate"
        style={{color: "var(--color-ink)", maxWidth: "60%"}}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}
