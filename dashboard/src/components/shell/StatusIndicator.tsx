import { colors } from "@/lib/tokens";

export function StatusIndicator({
  tone,
  label,
}: {
  tone: "ok" | "warn" | "crit";
  label: string;
}) {
  const color = tone === "ok" ? colors.gain : tone === "warn" ? colors.warn : colors.loss;
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block w-1.5 h-1.5" style={{ background: color, borderRadius: 1 }} />
      <span className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--color-ink-soft)]">
        {label}
      </span>
    </div>
  );
}
