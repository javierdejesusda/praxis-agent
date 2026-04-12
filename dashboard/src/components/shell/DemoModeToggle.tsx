"use client";

// UI-only placeholder. Selection is held in local React state; replay and
// snapshot modes show a Sonner toast and bounce the selection back to Live.
// Intentional until the backend exposes a replay endpoint.

import { useRef, useState } from "react";
import { toast } from "sonner";

type Mode = "live" | "replay" | "snapshot";

const OPTIONS: { value: Mode; label: string }[] = [
  { value: "live", label: "Live" },
  { value: "replay", label: "24h replay" },
  { value: "snapshot", label: "Snapshot" },
];

export function DemoModeToggle() {
  const [mode, setMode] = useState<Mode>("live");
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const select = (next: Mode, fromIndex: number) => {
    if (next === "live") {
      setMode("live");
      toast.dismiss();
      return;
    }
    toast.message("Replay mode coming soon", {
      description:
        next === "replay"
          ? "We're wiring the 24h replay feed — back to live for now."
          : "Snapshot mode is queued — back to live for now.",
      duration: 3200,
    });
    btnRefs.current[fromIndex]?.blur();
    btnRefs.current[0]?.focus();
  };

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const focusedIndex = OPTIONS.findIndex(
      (o) => btnRefs.current[OPTIONS.indexOf(o)] === document.activeElement,
    );
    if (focusedIndex < 0) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = (focusedIndex + 1) % OPTIONS.length;
      btnRefs.current[next]?.focus();
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      const next = (focusedIndex - 1 + OPTIONS.length) % OPTIONS.length;
      btnRefs.current[next]?.focus();
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Demo mode"
      onKeyDown={onKey}
      className="hidden md:inline-flex items-center rounded-full p-0.5"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-rule)",
      }}
    >
      {OPTIONS.map((opt, i) => {
        const active = opt.value === mode;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => select(opt.value, i)}
            className="text-[10px] font-semibold uppercase tracking-[0.08em] rounded-full cursor-pointer focus-visible:outline focus-visible:outline-2 transition-colors duration-150"
            style={{
              padding: "4px 10px",
              background: active ? "var(--color-accent)" : "transparent",
              color: active ? "#fff" : "var(--color-ink-soft)",
              outlineColor: "var(--color-accent)",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
