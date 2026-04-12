import type {ReactNode} from "react";

type Tone = "neutral" | "warn" | "info";

interface EmptyStateProps {
  label: string;
  sub?: string;
  icon?: ReactNode;
  action?: ReactNode;
  tone?: Tone;
}

function toneBadgeStyles(tone: Tone): {
  background: string;
  color: string;
  border: string;
} {
  switch (tone) {
    case "warn":
      return {
        background: "var(--color-warn-soft)",
        color: "var(--color-warn)",
        border: "1px solid color-mix(in srgb, var(--color-warn) 35%, transparent)",
      };
    case "info":
      return {
        background: "var(--color-accent-soft)",
        color: "var(--color-accent)",
        border: "1px solid color-mix(in srgb, var(--color-accent) 35%, transparent)",
      };
    default:
      return {
        background: "var(--color-hover)",
        color: "var(--color-muted)",
        border: "1px solid var(--color-rule)",
      };
  }
}

export function EmptyState({
  label,
  sub,
  icon,
  action,
  tone = "neutral",
}: EmptyStateProps) {
  const badge = toneBadgeStyles(tone);
  return (
    <div className="py-10 flex flex-col items-center text-center">
      {icon && (
        <div
          aria-hidden="true"
          className="mb-3 flex h-10 w-10 items-center justify-center rounded-full"
          style={{
            background: badge.background,
            color: badge.color,
            border: badge.border,
          }}
        >
          <span className="flex h-6 w-6 items-center justify-center">
            {icon}
          </span>
        </div>
      )}
      <div className="text-[13px] text-[color:var(--color-muted)]">{label}</div>
      {sub && (
        <div className="text-[11px] text-[color:var(--color-muted-soft)] mt-1.5 max-w-sm leading-relaxed">
          {sub}
        </div>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
