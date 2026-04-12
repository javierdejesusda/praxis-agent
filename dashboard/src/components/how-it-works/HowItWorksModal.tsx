"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BookOpen,
  Brain,
  Database,
  Gauge,
  Scale,
  ShieldCheck,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";

import {
  setHowItWorksOpen,
  useHowItWorksOpen,
} from "./how-it-works-store";

type Agent = {
  name: string;
  role: string;
  icon: LucideIcon;
};

// Sourced from C:\Projects\AI-trading-agent\CLAUDE.md "6 agents" line and the
// Strategy / Architecture sections. If those facts change, update here too.
const AGENTS: Agent[] = [
  { name: "Data Auditor", role: "Validates snapshots & feeds", icon: Database },
  { name: "Trend", role: "ADX / regime momentum score", icon: TrendingUp },
  { name: "Volatility", role: "Realized vol & spread window", icon: Gauge },
  { name: "Spread / Cost", role: "Fee, slippage, edge net of 55 bps", icon: Scale },
  { name: "LLM Analyst", role: "GPT reasoning on numerics only", icon: Brain },
  { name: "Risk Governor", role: "7 kill criteria, final veto", icon: ShieldCheck },
];

export function HowItWorksModal() {
  const open = useHowItWorksOpen();
  const reduceMotion = useReducedMotion();

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setHowItWorksOpen(false);
        return;
      }
      if (e.key === "Tab") {
        const root = dialogRef.current;
        if (!root) return;
        const focusables = root.querySelectorAll<HTMLElement>(
          'button, [href], [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);

    const raf = requestAnimationFrame(() => dialogRef.current?.focus());

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      const prev = previouslyFocusedRef.current;
      if (prev && document.contains(prev)) prev.focus();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="how-it-works-backdrop"
          className="fixed inset-0 z-[110] flex items-center justify-center px-4 py-8"
          style={{ background: "rgba(0,0,0,0.5)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.16 }}
          onClick={() => setHowItWorksOpen(false)}
          role="presentation"
        >
          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="how-it-works-title"
            className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl outline-none"
            style={{
              background: "var(--color-surface-solid)",
              border: "1px solid var(--color-rule-strong)",
              boxShadow: "0 24px 60px rgba(0,0,0,0.28)",
            }}
            initial={
              reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }
            }
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.4, 0, 0.2, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-6 py-4 border-b"
              style={{ borderColor: "var(--color-rule)" }}
            >
              <div className="flex items-center gap-2.5">
                <BookOpen
                  size={16}
                  strokeWidth={1.75}
                  style={{ color: "var(--color-accent)" }}
                />
                <h2
                  id="how-it-works-title"
                  className="text-[15px] font-semibold tracking-[-0.01em]"
                  style={{ color: "var(--color-ink)" }}
                >
                  How Praxis Agent works
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setHowItWorksOpen(false)}
                aria-label="Close"
                className="flex items-center justify-center w-7 h-7 rounded-md border cursor-pointer focus-visible:outline focus-visible:outline-2"
                style={{
                  borderColor: "var(--color-rule)",
                  color: "var(--color-ink-soft)",
                  outlineColor: "var(--color-accent)",
                }}
              >
                <X size={14} strokeWidth={1.75} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-7">
              <section>
                <h3
                  className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-3"
                  style={{ color: "var(--color-muted)" }}
                >
                  Six-agent pipeline
                </h3>
                <div className="flex flex-col md:flex-row md:items-stretch gap-2 md:gap-0">
                  {AGENTS.map((agent, i) => {
                    const Icon = agent.icon;
                    const isLast = i === AGENTS.length - 1;
                    return (
                      <motion.div
                        key={agent.name}
                        initial={
                          reduceMotion
                            ? { opacity: 0 }
                            : { opacity: 0, y: 6 }
                        }
                        animate={
                          reduceMotion
                            ? { opacity: 1 }
                            : { opacity: 1, y: 0 }
                        }
                        transition={{
                          duration: reduceMotion ? 0 : 0.22,
                          delay: reduceMotion ? 0 : i * 0.04,
                          ease: [0.4, 0, 0.2, 1],
                        }}
                        className="relative flex-1 flex md:flex-col items-center md:items-stretch gap-3 md:gap-0"
                      >
                        <div
                          className="flex md:flex-col items-center md:items-center gap-3 md:gap-2 px-3 py-3 rounded-xl flex-1"
                          style={{
                            background: "var(--color-surface)",
                            border: "1px solid var(--color-rule)",
                          }}
                        >
                          <div
                            className="flex items-center justify-center rounded-full"
                            style={{
                              width: 32,
                              height: 32,
                              background: "var(--color-accent)",
                              color: "#fff",
                              flexShrink: 0,
                            }}
                          >
                            <Icon size={16} strokeWidth={1.9} />
                          </div>
                          <div className="min-w-0 md:text-center md:mt-1">
                            <div
                              className="text-[12px] font-semibold tracking-[-0.01em] truncate"
                              style={{ color: "var(--color-ink)" }}
                            >
                              {agent.name}
                            </div>
                            <div
                              className="text-[10px] mt-0.5 leading-snug"
                              style={{ color: "var(--color-muted)" }}
                            >
                              {agent.role}
                            </div>
                          </div>
                        </div>
                        {!isLast && (
                          <div
                            className="hidden md:flex items-center justify-center"
                            style={{
                              width: 10,
                              color: "var(--color-muted-soft)",
                            }}
                            aria-hidden="true"
                          >
                            <div
                              style={{
                                width: 10,
                                height: 1,
                                background: "var(--color-rule-strong)",
                              }}
                            />
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </section>

              <section>
                <h3
                  className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-2"
                  style={{ color: "var(--color-muted)" }}
                >
                  Two-loop architecture
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    className="rounded-xl px-4 py-3"
                    style={{
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-rule)",
                    }}
                  >
                    <div
                      className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-1"
                      style={{ color: "var(--color-accent)" }}
                    >
                      Strategic · 4h
                    </div>
                    <p
                      className="text-[12px] leading-snug"
                      style={{ color: "var(--color-ink-soft)" }}
                    >
                      Signal agents + LLM analyst produce regime-aware trade
                      intents. Runs every four hours on fresh candles.
                    </p>
                  </div>
                  <div
                    className="rounded-xl px-4 py-3"
                    style={{
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-rule)",
                    }}
                  >
                    <div
                      className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-1"
                      style={{ color: "var(--color-loss)" }}
                    >
                      Protective · 1min
                    </div>
                    <p
                      className="text-[12px] leading-snug"
                      style={{ color: "var(--color-ink-soft)" }}
                    >
                      Deterministic risk governor polls seven kill criteria and
                      halts execution if any trip. No LLM in this loop.
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h3
                  className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-2"
                  style={{ color: "var(--color-muted)" }}
                >
                  Dual execution
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    className="rounded-xl px-4 py-3"
                    style={{
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-rule)",
                    }}
                  >
                    <div
                      className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-1"
                      style={{ color: "var(--color-ink)" }}
                    >
                      Kraken paper
                    </div>
                    <p
                      className="text-[12px] leading-snug"
                      style={{ color: "var(--color-ink-soft)" }}
                    >
                      Trades at 70+ confidence route to the Kraken CLI in paper
                      mode with real fees (0.25% maker / 0.40% taker).
                    </p>
                  </div>
                  <div
                    className="rounded-xl px-4 py-3"
                    style={{
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-rule)",
                    }}
                  >
                    <div
                      className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-1"
                      style={{ color: "var(--color-gain)" }}
                    >
                      ERC-8004 on-chain
                    </div>
                    <p
                      className="text-[12px] leading-snug"
                      style={{ color: "var(--color-ink-soft)" }}
                    >
                      Trades at 85+ confidence also emit EIP-712 signed
                      TradeIntents to the Risk Router on Sepolia.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <div
              className="px-6 py-3 border-t text-[10px] uppercase tracking-[0.12em]"
              style={{
                borderColor: "var(--color-rule)",
                color: "var(--color-muted-soft)",
                background: "var(--color-surface)",
              }}
            >
              Press <span className="num">esc</span> to close
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
