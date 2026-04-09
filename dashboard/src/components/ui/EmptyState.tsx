export function EmptyState({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="py-8 text-center">
      <div className="text-[12px] text-[color:var(--color-muted)]">{label}</div>
      {sub && <div className="text-[10px] text-[color:var(--color-muted-soft)] mt-1">{sub}</div>}
    </div>
  );
}
