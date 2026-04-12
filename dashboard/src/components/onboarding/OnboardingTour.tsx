"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const STORAGE_KEY = "praxis-onboarding-v1";

// Each step targets an element by scanning for a SectionHeader <h3> whose
// text matches one of the candidate titles. Other agents own the page
// components we can't edit, so relying on the stable heading text is the
// least-invasive way to resolve targets. If no target resolves, the tour
// gracefully degrades to a centered modal walkthrough (no spotlight).
type Step = {
  id: string;
  headingCandidates: string[];
  title: string;
  description: string;
};

const STEPS: Step[] = [
  {
    id: "regime",
    headingCandidates: ["Market Regime", "Regime"],
    title: "Regime detector",
    description:
      "ADX reading classifies each bar as trending or ranging — the signal agents then switch between momentum and mean-reversion playbooks.",
  },
  {
    id: "signal",
    headingCandidates: ["Latest Signal", "Latest Signals"],
    title: "Live signal stream",
    description:
      "Every strategic cycle, the six agents emit a confidence score. Scores above 70 route to Kraken paper, and 85+ also sign an on-chain TradeIntent.",
  },
  {
    id: "walkthrough",
    headingCandidates: ["Latest Decision Walkthrough", "Decision Walkthrough"],
    title: "Decision walkthrough",
    description:
      "Step through the last full decision: data audit, signals, costs, LLM reasoning, and risk governor verdict — every link in the chain.",
  },
  {
    id: "attestations",
    headingCandidates: ["Risk Governor", "Attestations", "Kill Criteria"],
    title: "Guardrails & attestations",
    description:
      "Seven kill criteria run on a one-minute protective loop. Each honored trade emits an ERC-8004 attestation you can verify on Sepolia.",
  },
];

type Rect = { top: number; left: number; width: number; height: number };

function resolveTarget(step: Step): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const headings = Array.from(
    document.querySelectorAll<HTMLHeadingElement>("h3"),
  );
  for (const candidate of step.headingCandidates) {
    const needle = candidate.trim().toLowerCase();
    const match = headings.find(
      (h) => h.textContent?.trim().toLowerCase() === needle,
    );
    if (match) {
      // Climb to the nearest HairlineCard / rounded card ancestor so the
      // spotlight surrounds the whole card, not just the title row.
      let node: HTMLElement | null = match;
      for (let i = 0; i < 6 && node; i++) {
        if (
          node.classList.contains("rounded-2xl") ||
          node.classList.contains("rounded-xl")
        ) {
          return node;
        }
        node = node.parentElement;
      }
      return match;
    }
  }
  return null;
}

function rectOf(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function readDone(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "done";
  } catch {
    return true;
  }
}

function writeDone() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, "done");
  } catch {
    // ignore
  }
}

export function OnboardingTour() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [degraded, setDegraded] = useState(false);
  const mountedRef = useRef(false);

  // Only start the tour once, on first visit to /overview, if storage flag
  // is unset. Runs only in the client; SSR is a no-op.
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    if (!pathname?.startsWith("/overview")) return;
    if (readDone()) return;
    // Delay to let the dashboard render its cards before we measure.
    const t = setTimeout(() => setActive(true), 600);
    return () => clearTimeout(t);
  }, [pathname]);

  const finish = useCallback(() => {
    writeDone();
    setActive(false);
  }, []);

  const next = useCallback(() => {
    setStepIdx((i) => {
      if (i >= STEPS.length - 1) {
        writeDone();
        setActive(false);
        return i;
      }
      return i + 1;
    });
  }, []);

  const prev = useCallback(() => {
    setStepIdx((i) => Math.max(0, i - 1));
  }, []);

  // Measure the current step's target when the step changes or on resize.
  // Falls through to the "degraded" centered modal if the target can't be
  // resolved — we document this in the module header.
  useLayoutEffect(() => {
    if (!active) return;
    const step = STEPS[stepIdx];
    const target = resolveTarget(step);
    if (!target) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDegraded(true);
       
      setRect(null);
      return;
    }
     
    setDegraded(false);
    target.scrollIntoView({
      block: "center",
      behavior: reduceMotion ? "auto" : "smooth",
    });
    // Measure on the next frame so smooth-scroll layout settles first.
    const raf = requestAnimationFrame(() => {
      setRect(rectOf(target));
    });
    const onResize = () => setRect(rectOf(target));
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [active, stepIdx, reduceMotion]);

  // Keyboard: ESC skips, Arrow/Enter advances, Shift+Tab goes back.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish();
        return;
      }
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
        return;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, finish, next, prev]);

  if (!active) return null;

  const step = STEPS[stepIdx];
  const stepLabel = `${stepIdx + 1} / ${STEPS.length}`;
  const pad = 10;

  // Tooltip placement: below the target if there's room, else above.
  let tipTop = 0;
  let tipLeft = 0;
  let placement: "below" | "above" | "center" = "center";
  if (rect && typeof window !== "undefined") {
    const vh = window.innerHeight;
    const spaceBelow = vh - (rect.top + rect.height);
    if (spaceBelow > 200) {
      placement = "below";
      tipTop = rect.top + rect.height + pad + 12;
    } else {
      placement = "above";
      tipTop = rect.top - pad - 12;
    }
    tipLeft = Math.min(
      Math.max(16, rect.left + rect.width / 2 - 180),
      (typeof window !== "undefined" ? window.innerWidth : 1200) - 376,
    );
  }

  const spotlight =
    rect && !degraded ? (
      <motion.div
        key={`spot-${step.id}`}
        className="pointer-events-none"
        initial={
          reduceMotion
            ? undefined
            : {
                top: rect.top - pad,
                left: rect.left - pad,
                width: rect.width + pad * 2,
                height: rect.height + pad * 2,
              }
        }
        animate={{
          top: rect.top - pad,
          left: rect.left - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
        }}
        transition={{
          duration: reduceMotion ? 0 : 0.28,
          ease: [0.4, 0, 0.2, 1],
        }}
        style={{
          position: "fixed",
          borderRadius: 18,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
          border: "2px solid var(--color-accent)",
          zIndex: 95,
        }}
      />
    ) : null;

  return (
    <AnimatePresence>
      <motion.div
        key="onboarding-layer"
        className="fixed inset-0 z-[90]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.2 }}
      >
        {degraded && (
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.55)" }}
            onClick={finish}
            role="presentation"
          />
        )}

        {spotlight}

        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-title"
          className="fixed"
          initial={
            reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }
          }
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
          style={
            degraded || !rect
              ? {
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: 360,
                  zIndex: 96,
                }
              : {
                  top: placement === "above" ? tipTop - 160 : tipTop,
                  left: tipLeft,
                  width: 360,
                  zIndex: 96,
                }
          }
        >
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: "var(--color-surface-solid)",
              border: "1px solid var(--color-rule-strong)",
              boxShadow: "0 18px 48px rgba(0,0,0,0.32)",
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-2.5 border-b"
              style={{ borderColor: "var(--color-rule)" }}
            >
              <div className="flex items-center gap-2">
                <Sparkles
                  size={13}
                  strokeWidth={1.9}
                  style={{ color: "var(--color-accent)" }}
                />
                <span
                  className="text-[10px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: "var(--color-muted)" }}
                >
                  Welcome tour
                </span>
              </div>
              <span
                className="num text-[10px]"
                style={{ color: "var(--color-muted-soft)" }}
              >
                {stepLabel}
              </span>
            </div>

            <div className="px-4 py-4">
              <h3
                id="onboarding-title"
                className="text-[14px] font-semibold tracking-[-0.01em] mb-1.5"
                style={{ color: "var(--color-ink)" }}
              >
                {step.title}
              </h3>
              <p
                className="text-[12px] leading-snug"
                style={{ color: "var(--color-ink-soft)" }}
              >
                {step.description}
              </p>
              {degraded && (
                <p
                  className="mt-2 text-[10px] leading-snug"
                  style={{ color: "var(--color-muted-soft)" }}
                >
                  We couldn&apos;t spotlight this card, but the tour still
                  walks you through what to look for.
                </p>
              )}
            </div>

            <div
              className="flex items-center justify-between px-4 py-2.5 border-t"
              style={{
                borderColor: "var(--color-rule)",
                background: "var(--color-surface)",
              }}
            >
              <button
                type="button"
                onClick={finish}
                className="text-[11px] font-medium cursor-pointer focus-visible:outline focus-visible:outline-2 rounded"
                style={{
                  color: "var(--color-muted)",
                  outlineColor: "var(--color-accent)",
                  padding: "4px 6px",
                }}
              >
                Skip
              </button>
              <div className="flex items-center gap-2">
                {stepIdx > 0 && (
                  <button
                    type="button"
                    onClick={prev}
                    className="text-[11px] font-medium cursor-pointer rounded-md border focus-visible:outline focus-visible:outline-2"
                    style={{
                      borderColor: "var(--color-rule-strong)",
                      color: "var(--color-ink-soft)",
                      padding: "5px 10px",
                      outlineColor: "var(--color-accent)",
                    }}
                  >
                    Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={next}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer rounded-md focus-visible:outline focus-visible:outline-2"
                  style={{
                    background: "var(--color-accent)",
                    color: "#fff",
                    padding: "6px 12px",
                    outlineColor: "var(--color-accent)",
                  }}
                >
                  {stepIdx === STEPS.length - 1 ? "Done" : "Next"}
                  {stepIdx < STEPS.length - 1 && (
                    <ArrowRight size={12} strokeWidth={2.2} />
                  )}
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        <button
          type="button"
          onClick={finish}
          aria-label="Skip tour"
          className="fixed top-4 right-4 flex items-center justify-center w-8 h-8 rounded-full cursor-pointer focus-visible:outline focus-visible:outline-2"
          style={{
            zIndex: 97,
            background: "var(--color-surface-solid)",
            border: "1px solid var(--color-rule-strong)",
            color: "var(--color-ink-soft)",
            outlineColor: "var(--color-accent)",
          }}
        >
          <X size={14} strokeWidth={1.9} />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
