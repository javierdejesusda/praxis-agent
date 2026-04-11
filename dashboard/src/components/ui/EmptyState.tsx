export function EmptyState({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="py-10 text-center">
      <div className="text-[13px] text-[color:var(--color-muted)]">{label}</div>
      {sub && <div className="text-[11px] text-[color:var(--color-muted-soft)] mt-1.5">{sub}</div>}
    </div>
  );
}
