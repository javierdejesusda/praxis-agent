"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Keyboard, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";

import { toggleTimezoneMode } from "@/lib/timezone";

import {
  setShortcutsOpen,
  useShortcutsOpen,
} from "./shortcuts-store";

type Shortcut = {
  keys: string[];
  label: string;
  soon?: boolean;
};

type Section = {
  title: string;
  rows: Shortcut[];
};

const SECTIONS: Section[] = [
  {
    title: "Navigation",
    rows: [
      { keys: ["⌘", "K"], label: "Command palette" },
      { keys: ["?"], label: "This shortcuts overlay" },
      { keys: ["g", "o"], label: "Go to Overview" },
      { keys: ["g", "a"], label: "Go to Agents" },
      { keys: ["g", "p"], label: "Go to Positions" },
      { keys: ["g", "s"], label: "Go to Signals" },
      { keys: ["g", "b"], label: "Go to Backtest" },
      { keys: ["g", "r"], label: "Go to Risk" },
      { keys: ["g", "t"], label: "Go to Attestations" },
      { keys: ["g", "d"], label: "Go to Audit" },
    ],
  },
  {
    title: "Theme",
    rows: [
      { keys: ["t"], label: "Toggle theme" },
      { keys: ["u"], label: "Toggle timezone (UTC / local)" },
    ],
  },
  {
    title: "Actions",
    rows: [{ keys: ["ESC"], label: "Close modal" }],
  },
];

const GOTO_MAP: Record<string, string> = {
  o: "/overview",
  a: "/agents",
  p: "/positions",
  s: "/signals",
  b: "/backtest",
  r: "/risk",
  t: "/attestations",
  d: "/audit",
};

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

export function ShortcutsOverlay() {
  const open = useShortcutsOpen();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const reduceMotion = useReducedMotion();

  // Global hotkeys: `?` opens, `g <x>` jumps, `t` toggles theme, `u` toggles
  // timezone. Refs cache the mutable "goto" state outside of React state so
  // the Next 16 React Compiler stays happy (no setState-in-effect).
  const gotoPendingRef = useRef(false);
  const gotoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearGoto = () => {
      gotoPendingRef.current = false;
      if (gotoTimerRef.current !== null) {
        clearTimeout(gotoTimerRef.current);
        gotoTimerRef.current = null;
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;

      if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
        clearGoto();
        return;
      }

      if (gotoPendingRef.current) {
        const href = GOTO_MAP[e.key.toLowerCase()];
        if (href) {
          e.preventDefault();
          router.push(href);
        }
        clearGoto();
        return;
      }

      if (e.key === "g" || e.key === "G") {
        gotoPendingRef.current = true;
        if (gotoTimerRef.current !== null) clearTimeout(gotoTimerRef.current);
        gotoTimerRef.current = setTimeout(clearGoto, 1500);
        return;
      }

      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        setTheme(resolvedTheme === "dark" ? "light" : "dark");
        return;
      }

      if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        toggleTimezoneMode();
        return;
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearGoto();
    };
  }, [router, resolvedTheme, setTheme]);

  // Close on ESC, lock body scroll, focus trap — only while open.
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
        setShortcutsOpen(false);
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

    const raf = requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });

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
          key="shortcuts-backdrop"
          className="fixed inset-0 z-[110] flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.16 }}
          onClick={() => setShortcutsOpen(false)}
          role="presentation"
        >
          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
            className="w-full max-w-[720px] max-h-[80vh] overflow-y-auto rounded-2xl outline-none"
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
              className="flex items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: "var(--color-rule)" }}
            >
              <div className="flex items-center gap-2.5">
                <Keyboard
                  size={16}
                  strokeWidth={1.75}
                  style={{ color: "var(--color-accent)" }}
                />
                <h2
                  id="shortcuts-title"
                  className="text-[14px] font-semibold tracking-[-0.01em]"
                  style={{ color: "var(--color-ink)" }}
                >
                  Keyboard shortcuts
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShortcutsOpen(false)}
                aria-label="Close shortcuts"
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

            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
              {SECTIONS.map((section) => (
                <section key={section.title}>
                  <h3
                    className="text-[10px] font-semibold uppercase tracking-[0.14em] pb-2 mb-2 border-b"
                    style={{
                      color: "var(--color-muted)",
                      borderColor: "var(--color-rule)",
                    }}
                  >
                    {section.title}
                  </h3>
                  <ul className="space-y-1.5">
                    {section.rows.map((row) => (
                      <li
                        key={row.label}
                        className="flex items-center justify-between gap-3 py-1"
                      >
                        <span
                          className="text-[12px] flex-1"
                          style={{
                            color: row.soon
                              ? "var(--color-muted-soft)"
                              : "var(--color-ink)",
                          }}
                        >
                          {row.label}
                          {row.soon && (
                            <span
                              className="ml-1.5 text-[9px] uppercase tracking-[0.08em]"
                              style={{ color: "var(--color-muted-soft)" }}
                            >
                              coming soon
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-1">
                          {row.keys.map((k, i) => (
                            <kbd
                              key={`${row.label}-${i}`}
                              className="font-mono inline-flex items-center justify-center"
                              style={{
                                minWidth: 20,
                                padding: "2px 6px",
                                borderRadius: 4,
                                fontSize: 10,
                                lineHeight: 1.2,
                                background: "var(--color-surface)",
                                border: "1px solid var(--color-rule-strong)",
                                color: "var(--color-ink)",
                              }}
                            >
                              {k}
                            </kbd>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            <div
              className="px-5 py-3 border-t text-[10px] uppercase tracking-[0.12em]"
              style={{
                borderColor: "var(--color-rule)",
                color: "var(--color-muted-soft)",
                background: "var(--color-surface)",
              }}
            >
              Press <span className="num">esc</span> to close ·{" "}
              <span className="num">⌘K</span> opens the command palette
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

