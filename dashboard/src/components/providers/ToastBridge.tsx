"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useKillCriteria } from "@/lib/hooks";
import type { KillCriteria } from "@/lib/api";

const CRITERIA_LABELS: Record<keyof KillCriteria, string> = {
  stale_data: "Market snapshot stale",
  malformed_output: "Kraken CLI output malformed",
  ledger_mismatch: "Ledger mismatch",
  spread_too_wide: "Spread > 20 bps",
  daily_loss_breached: "Daily loss cap breached",
  max_drawdown_breached: "Max drawdown breached",
  kill_switch: "Kill switch activated",
};

export function ToastBridge() {
  const { data: kill } = useKillCriteria();
  const prevRef = useRef<KillCriteria | null>(null);

  useEffect(() => {
    if (!kill) return;
    const prev = prevRef.current;
    if (prev) {
      for (const k of Object.keys(CRITERIA_LABELS) as Array<keyof KillCriteria>) {
        if (kill[k] && !prev[k]) {
          toast.error(CRITERIA_LABELS[k], {
            description: "Kill criterion tripped — trading paused.",
            duration: 8000,
          });
        } else if (!kill[k] && prev[k]) {
          toast.success(`${CRITERIA_LABELS[k]} cleared`, {
            duration: 4000,
          });
        }
      }
    }
    prevRef.current = { ...kill };
  }, [kill]);

  return null;
}
