"use client";

import {useState} from "react";
import {AnimatePresence, motion} from "framer-motion";
import {ChevronRight} from "lucide-react";

import {NumericValue} from "@/components/ui/NumericValue";
import {Skeleton} from "@/components/ui/Skeleton";
import {StatusPill} from "@/components/ui/StatusPill";
import {useKillCriteria, usePortfolio} from "@/lib/hooks";

const STALE_DATA_SECONDS = 7200;
const MAX_DAILY_LOSS_PCT = 0.03;
const MAX_DRAWDOWN_PCT = 0.08;
const MIN_SPREAD_BPS = 20;

type GateId =
  | "stale_data"
  | "malformed_output"
  | "ledger_mismatch"
  | "spread_too_wide"
  | "daily_loss_breached"
  | "max_drawdown_breached"
  | "kill_switch";

type Gate = {
  id: GateId;
  criterion: string;
  threshold: string;
  current: React.ReactNode;
  tripped: boolean;
  explanation: string;
  ratio: number | null;
};

function formatStaleWindow(seconds: number): string {
  const hours = seconds / 3600;
  if (Number.isInteger(hours)) return `\u2264 ${hours}h`;
  return `\u2264 ${seconds}s`;
}

function barTone(ratio: number | null, tripped: boolean): string {
  if (tripped || (ratio !== null && ratio >= 1)) return "var(--color-loss)";
  if (ratio !== null && ratio >= 0.7) return "var(--color-warn)";
  return "var(--color-gain)";
}

function GateBar({
  ratio,
  tripped,
}: {
  ratio: number | null;
  tripped: boolean;
}) {
  if (ratio === null && !tripped) return null;
  const clamped = tripped ? 1 : Math.max(0, Math.min(1, ratio ?? 0));
  const color = barTone(ratio, tripped);
  return (
    <div
      className="relative w-full h-1.5 rounded-full overflow-hidden"
      style={{background: "var(--color-rule)"}}
      aria-hidden="true"
    >
      <motion.div
        initial={{width: 0}}
        animate={{width: `${clamped * 100}%`}}
        transition={{duration: 0.3, ease: [0.22, 1, 0.36, 1]}}
        className="absolute top-0 left-0 h-full"
        style={{background: color}}
      />
    </div>
  );
}

export function KillCriteriaTable() {
  const {data: kill, isLoading: killLoading} = useKillCriteria();
  const {data: portfolio, isLoading: portfolioLoading} = usePortfolio();
  const loading = killLoading || portfolioLoading;
  const [expandedId, setExpandedId] = useState<GateId | null>(null);

  if (loading) {
    return (
      <div
        role="region"
        aria-label="Kill criteria status"
        aria-busy="true"
        className="px-5 pb-4"
      >
        <div className="grid grid-cols-[1.3fr_1fr_1fr_auto] gap-x-6 gap-y-3 pt-3">
          {Array.from({length: 7}).map((_, i) => (
            <div key={i} className="contents">
              <Skeleton width="70%" height={12} />
              <Skeleton width="55%" height={12} />
              <Skeleton width="45%" height={12} />
              <Skeleton width={48} height={18} radius={9} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const dailyPnlRatio =
    portfolio && portfolio.equity > 0
      ? portfolio.daily_pnl / portfolio.equity
      : null;
  const dailyLossRatio =
    dailyPnlRatio !== null && dailyPnlRatio < 0
      ? Math.min(1, Math.abs(dailyPnlRatio) / MAX_DAILY_LOSS_PCT)
      : dailyPnlRatio !== null
        ? 0
        : null;
  const drawdownRatio =
    portfolio !== undefined
      ? Math.min(1, portfolio.drawdown_pct / MAX_DRAWDOWN_PCT)
      : null;

  const gates: Gate[] = [
    {
      id: "stale_data",
      criterion: "Data Freshness",
      threshold: formatStaleWindow(STALE_DATA_SECONDS),
      current: "\u2014",
      tripped: Boolean(kill?.stale_data),
      ratio: null,
      explanation:
        "Fails when the last market snapshot is older than 5 minutes. Stale quotes invalidate spread and volatility gates.",
    },
    {
      id: "malformed_output",
      criterion: "Output Integrity",
      threshold: "Valid schema",
      current: "\u2014",
      tripped: Boolean(kill?.malformed_output),
      ratio: null,
      explanation:
        "Fails when the Kraken CLI returns output that cannot be parsed. Prevents executing on unverifiable responses.",
    },
    {
      id: "ledger_mismatch",
      criterion: "Ledger Match",
      threshold: "Internal \u2261 Exchange",
      current: "\u2014",
      tripped: Boolean(kill?.ledger_mismatch),
      ratio: null,
      explanation:
        "Fails when the internal ledger diverges from exchange balances. Guards against silent fill or fee drift.",
    },
    {
      id: "spread_too_wide",
      criterion: "Spread",
      threshold: `\u2264 ${MIN_SPREAD_BPS} bps`,
      current: "\u2014",
      tripped: Boolean(kill?.spread_too_wide),
      ratio: null,
      explanation:
        "Fails when quoted spread exceeds 20 bps. Real Kraken round-trip cost makes wider spreads uneconomic versus expected edge.",
    },
    {
      id: "daily_loss_breached",
      criterion: "Daily Loss Cap",
      threshold: (MAX_DAILY_LOSS_PCT * 100).toFixed(2) + "%",
      current:
        dailyPnlRatio !== null ? (
          <NumericValue value={dailyPnlRatio} kind="pct" />
        ) : (
          "\u2014"
        ),
      tripped: Boolean(kill?.daily_loss_breached),
      ratio: dailyLossRatio,
      explanation:
        "Fails when cumulative daily loss exceeds 3% of equity. Hard daily stop prevents tilt and compounding drawdowns.",
    },
    {
      id: "max_drawdown_breached",
      criterion: "Max Drawdown",
      threshold: (MAX_DRAWDOWN_PCT * 100).toFixed(2) + "%",
      current:
        portfolio !== undefined ? (
          <NumericValue value={portfolio.drawdown_pct} kind="pct" />
        ) : (
          "\u2014"
        ),
      tripped: Boolean(kill?.max_drawdown_breached),
      ratio: drawdownRatio,
      explanation:
        "Fails when peak-to-trough drawdown exceeds 8%. Session halts until operator review and recovery.",
    },
    {
      id: "kill_switch",
      criterion: "Kill Switch",
      threshold: "Manual override off",
      current: "\u2014",
      tripped: Boolean(kill?.kill_switch),
      ratio: null,
      explanation:
        "Fails when an operator manually activates the kill switch. Immediate, unconditional halt of all execution.",
    },
  ];

  const toggle = (id: GateId) =>
    setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div
      role="region"
      aria-label="Kill criteria status"
      className="px-5 pb-4 flex flex-col gap-1.5"
    >
      <div className="grid grid-cols-[auto_1.4fr_1fr_1fr_auto] gap-x-4 py-2 border-b border-[color:var(--color-rule-strong)] text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-muted)] font-medium">
        <span />
        <span>Criterion</span>
        <span>Threshold</span>
        <span className="text-right">Current</span>
        <span className="text-right">Status</span>
      </div>
      {gates.map((g) => {
        const isOpen = expandedId === g.id;
        return (
          <div
            key={g.id}
            className="border-b border-[color:var(--color-rule)] last:border-b-0"
          >
            <button
              type="button"
              onClick={() => toggle(g.id)}
              aria-expanded={isOpen}
              aria-controls={`gate-panel-${g.id}`}
              aria-label={`${g.criterion}: ${g.tripped ? "tripped" : "ok"}. Expand details.`}
              className="w-full grid grid-cols-[auto_1.4fr_1fr_1fr_auto] gap-x-4 items-center py-2 text-[13px] cursor-pointer text-left transition-colors duration-150 hover:bg-[color:var(--color-hover)] focus-visible:outline-none focus-visible:bg-[color:var(--color-hover)] rounded-md"
            >
              <motion.span
                animate={{rotate: isOpen ? 90 : 0}}
                transition={{duration: 0.18, ease: [0.22, 1, 0.36, 1]}}
                className="inline-flex items-center justify-center text-[color:var(--color-muted)]"
                style={{width: 16}}
                aria-hidden="true"
              >
                <ChevronRight size={14} strokeWidth={2} />
              </motion.span>
              <span className="text-[color:var(--color-ink)]">
                {g.criterion}
              </span>
              <span className="num text-[color:var(--color-ink-soft)]">
                {g.threshold}
              </span>
              <span className="num text-right text-[color:var(--color-ink-soft)]">
                {g.current}
              </span>
              <span className="text-right">
                <StatusPill
                  tone={g.tripped ? "crit" : "ok"}
                  label={g.tripped ? "TRIP" : "OK"}
                />
              </span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={`gate-panel-${g.id}`}
                  key="panel"
                  initial={{height: 0, opacity: 0}}
                  animate={{height: "auto", opacity: 1}}
                  exit={{height: 0, opacity: 0}}
                  transition={{duration: 0.22, ease: [0.22, 1, 0.36, 1]}}
                  style={{overflow: "hidden"}}
                >
                  <div
                    className="flex flex-col gap-2.5 px-6 py-3 mb-2 rounded-lg"
                    style={{
                      background: "var(--color-paper)",
                      border: "1px solid var(--color-rule)",
                    }}
                  >
                    {g.ratio !== null && (
                      <GateBar ratio={g.ratio} tripped={g.tripped} />
                    )}
                    <p className="text-[12px] leading-relaxed text-[color:var(--color-ink-soft)]">
                      {g.explanation}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
