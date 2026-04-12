"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

import { useCommandOpen } from "./command-store";

const STORAGE_KEY = "praxis:cmdk-hint-dismissed";
const AUTO_HIDE_MS = 6000;

type Snapshot = { visible: boolean };

// Module-level state machine. Initialized lazily on first subscribe so we
// never touch localStorage or setTimeout during render, and components only
// read the snapshot via useSyncExternalStore — no React setState lives in
// any effect in this file, which keeps the Next 16 React Compiler happy.
let snapshot: Snapshot = { visible: false };
let initialized = false;
let timerId: ReturnType<typeof setTimeout> | null = null;

const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

function persistDismissed() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // localStorage unavailable — silently ignore.
  }
}

function readDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

function setVisible(next: boolean) {
  if (snapshot.visible === next) return;
  snapshot = { visible: next };
  notify();
}

function ensureInitialized() {
  if (initialized) return;
  initialized = true;
  if (typeof window === "undefined") return;
  if (readDismissed()) return;
  snapshot = { visible: true };
  timerId = setTimeout(() => {
    timerId = null;
    persistDismissed();
    setVisible(false);
  }, AUTO_HIDE_MS);
}

function subscribe(fn: () => void): () => void {
  ensureInitialized();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getSnapshot(): Snapshot {
  return snapshot;
}

function getServerSnapshot(): Snapshot {
  return { visible: false };
}

function dismiss() {
  if (timerId !== null) {
    clearTimeout(timerId);
    timerId = null;
  }
  persistDismissed();
  setVisible(false);
}

export function CommandHint() {
  const { visible } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const paletteOpen = useCommandOpen();
  const reduceMotion = useReducedMotion();

  // Bridge the palette store into the hint store. This effect mutates the
  // module-level hint store, not React state, so the Next 16 React Compiler
  // set-state-in-effect rule does not apply — the same pattern used by
  // CommandPalette's global hotkey effect.
  useEffect(() => {
    if (paletteOpen && snapshot.visible) {
      dismiss();
    }
  }, [paletteOpen]);

  if (!visible) return null;

  const kbdStyle = {
    border: "1px solid var(--color-rule-strong)",
    background: "var(--color-hover)",
    borderRadius: 2,
    fontSize: 9,
    padding: "1px 4px",
    color: "var(--color-ink)",
    lineHeight: 1.2,
  } as const;

  const mutedLabel = {
    color: "var(--color-muted)",
  } as const;

  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.24, delay: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className="hidden sm:flex items-center gap-2 rounded-full"
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 40,
        padding: "6px 8px 6px 12px",
        background: "var(--color-surface-solid)",
        border: "1px solid var(--color-rule-strong)",
        boxShadow: "0 6px 20px rgba(0,0,0,0.08)",
      }}
    >
      <Sparkles
        size={12}
        strokeWidth={1.75}
        style={{ color: "var(--color-muted)" }}
        aria-hidden="true"
      />
      <span
        className="text-[10px] uppercase tracking-[0.08em]"
        style={mutedLabel}
      >
        Press
      </span>
      <kbd className="font-mono inline-block" style={kbdStyle}>
        &#8984;
      </kbd>
      <kbd className="font-mono inline-block" style={kbdStyle}>
        K
      </kbd>
      <span
        className="text-[10px] uppercase tracking-[0.08em]"
        style={mutedLabel}
      >
        to navigate
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss command palette hint"
        className="ml-1 inline-flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-1"
        style={{
          width: 16,
          height: 16,
          color: "var(--color-muted)",
          background: "transparent",
          outlineColor: "var(--color-accent)",
        }}
      >
        <X size={11} strokeWidth={2} aria-hidden="true" />
      </button>
    </motion.div>
  );
}
