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
    <div className="flex items-end justify-between mb-8 pb-5 border-b border-[color:var(--color-rule)]">
      <div>
        {eyebrow && (
          <div className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-muted)] mb-1 font-medium">
            {eyebrow}
          </div>
        )}
        <h1 className="text-[28px] font-semibold text-[color:var(--color-ink)] leading-tight tracking-[-0.03em]">
          {title}
        </h1>
        {description && (
          <p className="text-[14px] text-[color:var(--color-muted)] mt-1 max-w-2xl leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {rightSlot && <div className="flex items-center gap-3">{rightSlot}</div>}
    </div>
  );
}
