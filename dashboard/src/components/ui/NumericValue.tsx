import { fmtUsd, fmtPct, fmtBps, fmtInt } from "@/lib/format";

export type NumericKind = "usd" | "pct" | "bps" | "int" | "ratio";

export type NumericValueProps = {
  value: number;
  kind: NumericKind;
  decimals?: number;
  sign?: "auto" | "always" | "never";
  color?: "auto" | "none";
  className?: string;
};

export function NumericValue({
  value,
  kind,
  decimals,
  sign = "auto",
  color = "none",
  className = "",
}: NumericValueProps) {
  let text: string;
  switch (kind) {
    case "usd":
      text = fmtUsd(value, { sign, decimals });
      break;
    case "pct":
      text = fmtPct(value, { sign: sign === "never" ? "auto" : sign, decimals });
      break;
    case "bps":
      text = fmtBps(value, decimals);
      break;
    case "int":
      text = fmtInt(value);
      break;
    case "ratio":
      text = value.toFixed(decimals ?? 2);
      break;
  }
  const tone =
    color === "auto"
      ? value > 0
        ? "text-[color:var(--color-gain)]"
        : value < 0
        ? "text-[color:var(--color-loss)]"
        : "text-[color:var(--color-ink)]"
      : "";
  return <span className={`num ${tone} ${className}`}>{text}</span>;
}
