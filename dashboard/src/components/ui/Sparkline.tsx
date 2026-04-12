export function Sparkline({
  data,
  width = 96,
  height = 24,
  tone = "auto",
  strokeWidth = 1,
}: {
  data: number[];
  width?: number;
  height?: number;
  tone?: "gain" | "loss" | "neutral" | "auto";
  strokeWidth?: number;
}) {
  if (data.length < 2) {
    return <span className="text-[color:var(--color-muted-soft)] text-[10px]">—</span>;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data
    .map(
      (v, i) =>
        `${(i * step).toFixed(2)},${(
          height - ((v - min) / range) * height
        ).toFixed(2)}`,
    )
    .join(" ");
  const resolvedTone =
    tone === "auto"
      ? data[data.length - 1] >= data[0]
        ? "gain"
        : "loss"
      : tone;
  const stroke =
    resolvedTone === "gain"
      ? "var(--color-gain)"
      : resolvedTone === "loss"
        ? "var(--color-loss)"
        : "var(--color-muted)";
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        points={points}
      />
    </svg>
  );
}
