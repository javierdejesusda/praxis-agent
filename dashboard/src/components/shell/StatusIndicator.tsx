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
    <div className="flex items-center gap-2">
      <span
        className={`inline-block w-2 h-2 rounded-full ${tone === "ok" ? "live-dot" : ""}`}
        style={{ background: color }}
      />
      <span className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--color-ink-soft)] font-medium">
        {label}
      </span>
    </div>
  );
}
