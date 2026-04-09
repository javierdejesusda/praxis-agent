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
  const valueSize = emphasis === "strong" ? "text-[22px]" : "text-[16px]";
  return (
    <div className={`flex flex-col ${align === "right" ? "items-end text-right" : "items-start text-left"}`}>
      <div className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--color-muted)] mb-1">
        {label}
      </div>
      <div className={`num font-medium text-[color:var(--color-ink)] ${valueSize} leading-none`}>
        {value}
      </div>
      {(delta || footnote) && (
        <div className="flex items-baseline gap-2 mt-1">
          {delta && <Delta value={delta.value} unit={delta.unit} />}
          {footnote && <span className="text-[10px] text-[color:var(--color-muted-soft)]">{footnote}</span>}
        </div>
      )}
    </div>
  );
}
