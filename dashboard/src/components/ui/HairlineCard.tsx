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
      className={`rounded-2xl ${padded ? "px-5 py-4" : ""} ${className}`}
      style={{
        background: "rgba(255, 255, 255, 0.72)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
        border: "1px solid rgba(0, 0, 0, 0.06)",
        boxShadow: "0 0.5px 1px rgba(0, 0, 0, 0.03), 0 2px 8px rgba(0, 0, 0, 0.02)",
        transition: "box-shadow 300ms cubic-bezier(0.25, 0.1, 0.25, 1), transform 300ms cubic-bezier(0.25, 0.1, 0.25, 1)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.06), 0 8px 24px rgba(0, 0, 0, 0.04)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "0 0.5px 1px rgba(0, 0, 0, 0.03), 0 2px 8px rgba(0, 0, 0, 0.02)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {children}
    </div>
  );
}
