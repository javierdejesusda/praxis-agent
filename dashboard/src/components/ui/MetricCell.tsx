import { Delta } from "./Delta";

export function MetricCell({
  label,
  value,
  delta,
  footnote,
  emphasis = "default",
  align = "left",
}: {
  label: string;
  value: React.ReactNode;
  delta?: { value: number; unit: "usd" | "pct" | "bps" };
  footnote?: string;
  emphasis?: "default" | "strong";
  align?: "left" | "right";
}) {
  const isStrong = emphasis === "strong";
  const valueSize = isStrong ? "text-[26px]" : "text-[18px]";
  const valueWeight = isStrong ? "font-semibold" : "font-medium";
  return (
    <div className={`flex flex-col ${align === "right" ? "items-end text-right" : "items-start text-left"}`}>
      <div className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-muted)] mb-1.5 font-medium">
        {label}
      </div>
      <div className={`num ${valueWeight} text-[color:var(--color-ink)] ${valueSize} leading-none tracking-[-0.02em]`}>
        {value}
      </div>
      {(delta || footnote) && (
        <div className="flex items-baseline gap-2 mt-1.5">
          {delta && <Delta value={delta.value} unit={delta.unit} />}
          {footnote && <span className="text-[10px] text-[color:var(--color-muted-soft)]">{footnote}</span>}
        </div>
      )}
    </div>
  );
}
