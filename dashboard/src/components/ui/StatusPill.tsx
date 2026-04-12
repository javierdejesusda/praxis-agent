export type PillTone = "ok" | "warn" | "crit" | "neutral" | "info";

const TONES: Record<PillTone, { bg: string; fg: string; dot: string }> = {
  ok: {
    bg: "var(--color-gain)",
    fg: "text-white",
    dot: "bg-white",
  },
  warn: {
    bg: "var(--color-warn)",
    fg: "text-white",
    dot: "bg-white",
  },
  crit: {
    bg: "var(--color-loss)",
    fg: "text-white",
    dot: "bg-white",
  },
  neutral: {
    bg: "var(--color-rule-strong)",
    fg: "text-[color:var(--color-ink-soft)]",
    dot: "bg-[color:var(--color-muted)]",
  },
  info: {
    bg: "var(--color-accent)",
    fg: "text-white",
    dot: "bg-white",
  },
};

export function StatusPill({
  tone,
  label,
  dot = true,
}: {
  tone: PillTone;
  label: string;
  dot?: boolean;
}) {
  const t = TONES[tone];
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.04em] rounded-full ${t.fg}`}
      style={{
        background: t.bg,
        transition: "opacity 200ms cubic-bezier(0.25, 0.1, 0.25, 1)",
      }}
    >
      {dot && <span className={`inline-block w-1.5 h-1.5 rounded-full ${t.dot}`} />}
      {label}
    </span>
  );
}
