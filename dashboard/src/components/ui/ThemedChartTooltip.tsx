"use client";

import {NumericValue, type NumericKind} from "@/components/ui/NumericValue";

type TooltipPayloadEntry = {
  value?: number | string | Array<number | string>;
  name?: string | number;
  color?: string;
  dataKey?: string | number;
};

export type ThemedChartTooltipProps = {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string | number;
  valueKind?: NumericKind;
  valueDecimals?: number;
};

export default function ThemedChartTooltip({
  active,
  payload,
  label,
  valueKind = "usd",
  valueDecimals,
}: ThemedChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div
      className="rounded-xl px-3 py-2 shadow-lg"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-rule-strong)",
        color: "var(--color-ink)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
        minWidth: 140,
      }}
    >
      {label != null ? (
        <div
          className="text-[10px] uppercase tracking-[0.06em]"
          style={{color: "var(--color-muted)", marginBottom: 6}}
        >
          {String(label)}
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        {payload.map((entry: TooltipPayloadEntry, i: number) => {
          const raw = entry.value;
          const numeric =
            typeof raw === "number"
              ? raw
              : typeof raw === "string"
                ? Number(raw)
                : NaN;
          const name = entry.name ?? entry.dataKey ?? "";
          const color = entry.color ?? "var(--color-accent)";
          return (
            <div
              key={`${name}-${i}`}
              className="flex items-center justify-between gap-4 text-[12px]"
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: color,
                  }}
                />
                <span style={{color: "var(--color-muted)"}}>{String(name)}</span>
              </span>
              {Number.isFinite(numeric) ? (
                <NumericValue
                  value={numeric}
                  kind={valueKind}
                  decimals={valueDecimals}
                />
              ) : (
                <span className="num text-[color:var(--color-muted)]">—</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
