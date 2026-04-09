import { NumericValue, type NumericKind } from "./NumericValue";

export function Delta({
  value,
  unit,
  decimals,
}: {
  value: number;
  unit: Extract<NumericKind, "usd" | "pct" | "bps">;
  decimals?: number;
}) {
  return (
    <NumericValue
      value={value}
      kind={unit}
      decimals={decimals}
      sign="always"
      color="auto"
    />
  );
}
