export function SectionHeader({
  title,
  count,
  rightSlot,
}: {
  title: string;
  count?: number;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between pb-2 mb-3 border-b border-[color:var(--color-rule)]">
      <div className="flex items-baseline gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-muted)]">
          {title}
        </h3>
        {count !== undefined && (
          <span className="num text-[10px] text-[color:var(--color-muted-soft)]">
            ({count})
          </span>
        )}
      </div>
      {rightSlot}
    </div>
  );
}
