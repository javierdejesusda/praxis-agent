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
      className={`rounded-2xl border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] backdrop-blur-xl backdrop-saturate-[1.8] shadow-[0_0.5px_1px_rgba(0,0,0,0.03),0_2px_8px_rgba(0,0,0,0.02)] transition-[box-shadow,transform] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] hover:-translate-y-px hover:shadow-[0_2px_8px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
        padded ? "px-5 py-4" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
