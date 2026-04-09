"use client";

import useSWR from "swr";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8888";

export function ApiHealthBanner() {
  const { error } = useSWR(
    `${API_BASE}/api/health`,
    (u: string) => fetch(u).then((r) => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    }),
    { refreshInterval: 10000 },
  );
  if (!error) return null;
  return (
    <div className="bg-[color:var(--color-loss-soft)] border-b border-[color:var(--color-loss)]/30 px-4 py-1.5 text-[11px] text-[color:var(--color-loss)]">
      BACKEND UNREACHABLE — {API_BASE} — verify FastAPI is running on port 8888.
    </div>
  );
}
