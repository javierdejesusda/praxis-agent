export function KeyValueGrid({
  items,
  columns = 2,
  align = "right",
}: {
  items: Array<{ k: string; v: React.ReactNode }>;
  columns?: 1 | 2 | 3;
  align?: "left" | "right";
}) {
  const grid = columns === 1 ? "grid-cols-1" : columns === 2 ? "grid-cols-2" : "grid-cols-3";
  return (
    <dl className={`grid ${grid} gap-x-8 gap-y-2 text-[12px]`}>
      {items.map((it, i) => (
        <div key={i} className="flex items-baseline justify-between border-b border-dotted border-[color:var(--color-rule)] pb-1.5">
          <dt className="text-[color:var(--color-muted)] uppercase tracking-[0.06em] text-[10px] font-medium">
            {it.k}
          </dt>
          <dd className={`num text-[color:var(--color-ink)] ${align === "right" ? "text-right" : "text-left"}`}>
            {it.v}
          </dd>
        </div>
      ))}
    </dl>
  );
}
