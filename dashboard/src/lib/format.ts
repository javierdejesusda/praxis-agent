export function fmtUsd(n: number, opts: { sign?: "auto" | "always" | "never"; decimals?: number } = {}): string {
  const { sign = "auto", decimals = 2 } = opts;
  const abs = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  if (sign === "always") return `${n >= 0 ? "+" : "-"}$${abs}`;
  if (sign === "never") return `$${abs}`;
  return n < 0 ? `-$${abs}` : `$${abs}`;
}

export function fmtPct(n: number, opts: { decimals?: number; sign?: "auto" | "always" } = {}): string {
  const { decimals = 2, sign = "auto" } = opts;
  const v = (n * 100).toFixed(decimals);
  if (sign === "always" && n >= 0) return `+${v}%`;
  return `${v}%`;
}

export function fmtBps(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)} bps`;
}

export function fmtInt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function fmtTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 19).replace("T", " ") + "Z";
}

export function fmtRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "—";
  const diff = Math.round((now - t) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export function fmtHashShort(h: string | null | undefined, len = 6): string {
  if (!h) return "—";
  if (h.length <= len * 2 + 2) return h;
  return `${h.slice(0, len + 2)}…${h.slice(-len)}`;
}
