export function HairlineCard({
  children,
  padded = true,
  className = "",
}: {
  children: React.ReactNode;
  padded?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`bg-[color:var(--color-bone)] border border-[color:var(--color-rule)] ${padded ? "px-4 py-3" : ""} ${className}`}
      style={{ borderRadius: 2 }}
    >
      {children}
    </div>
  );
}
