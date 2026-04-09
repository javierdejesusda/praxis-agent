"use client";
import { useEffect, useState } from "react";
import { fmtRelative } from "@/lib/format";

export function LastUpdated({ iso }: { iso: string | null | undefined }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="num text-[10px] text-[color:var(--color-muted)]">
      Last tick {fmtRelative(iso)}
    </span>
  );
}
