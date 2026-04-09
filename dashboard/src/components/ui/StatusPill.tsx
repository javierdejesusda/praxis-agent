export type PillTone = "ok" | "warn" | "crit" | "neutral" | "info";

const TONES: Record<PillTone, { bg: string; fg: string; border: string; dot: string }> = {
  ok:      { bg: "bg-[color:var(--color-gain-soft)]",   fg: "text-[color:var(--color-gain)]",   border: "border-[color:var(--color-gain)]/30",   dot: "bg-[color:var(--color-gain)]" },
  warn:    { bg: "bg-[color:var(--color-warn-soft)]",   fg: "text-[color:var(--color-warn)]",   border: "border-[color:var(--color-warn)]/30",   dot: "bg-[color:var(--color-warn)]" },
  crit:    { bg: "bg-[color:var(--color-loss-soft)]",   fg: "text-[color:var(--color-loss)]",   border: "border-[color:var(--color-loss)]/30",   dot: "bg-[color:var(--color-loss)]" },
  neutral: { bg: "bg-[color:var(--color-paper)]",       fg: "text-[color:var(--color-muted)]",  border: "border-[color:var(--color-rule)]",      dot: "bg-[color:var(--color-muted)]" },
  info:    { bg: "bg-[color:var(--color-accent-soft)]", fg: "text-[color:var(--color-accent)]", border: "border-[color:var(--color-accent)]/30", dot: "bg-[color:var(--color-accent)]" },
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
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] border ${t.bg} ${t.fg} ${t.border}`} style={{ borderRadius: 2 }}>
      {dot && <span className={`inline-block w-1.5 h-1.5 ${t.dot}`} style={{ borderRadius: 1 }} />}
      {label}
    </span>
  );
}
