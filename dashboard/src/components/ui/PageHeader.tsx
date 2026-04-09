export function PageHeader({
  eyebrow,
  title,
  description,
  rightSlot,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between mb-6 pb-4 border-b border-[color:var(--color-rule-strong)]">
      <div>
        {eyebrow && (
          <div className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-muted)] mb-1">
            {eyebrow}
          </div>
        )}
        <h1 className="text-[22px] font-medium text-[color:var(--color-ink)] leading-tight">
          {title}
        </h1>
        {description && (
          <p className="text-[12px] text-[color:var(--color-muted)] mt-1 max-w-2xl">
            {description}
          </p>
        )}
      </div>
      {rightSlot && <div className="flex items-center gap-3">{rightSlot}</div>}
    </div>
  );
}
