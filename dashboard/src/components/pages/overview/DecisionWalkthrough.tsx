"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { ArrowRight, ExternalLink, Play } from "lucide-react";

import { useArtifacts, useKillCriteria, useOnchainStatus } from "@/lib/hooks";
import type {
  Artifact,
  Attestation,
  KillCriteria,
  Signal,
} from "@/lib/api";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";
import { Skeleton } from "@/components/ui/Skeleton";
import { etherscanTx } from "@/lib/chain";
import { fmtHashShort, fmtRelative, fmtUsd } from "@/lib/format";

type KillKey = keyof KillCriteria;

const KILL_GATES: Array<{ key: KillKey; label: string }> = [
  { key: "stale_data", label: "Data freshness" },
  { key: "malformed_output", label: "Output integrity" },
  { key: "ledger_mismatch", label: "Ledger reconciliation" },
  { key: "spread_too_wide", label: "Spread \u2264 20 bps" },
  { key: "daily_loss_breached", label: "Daily loss cap" },
  { key: "max_drawdown_breached", label: "Max drawdown" },
  { key: "kill_switch", label: "Kill switch" },
];

function pickWalkthroughArtifact(artifacts: Artifact[] | undefined): Artifact | null {
  if (!artifacts || artifacts.length === 0) return null;
  const rich = artifacts.find(
    (a) =>
      a.payload?.risk_decision &&
      (a.payload.intent || (a.payload.signals && a.payload.signals.length > 0)),
  );
  if (rich) return rich;
  return artifacts.find((a) => a.payload?.risk_decision) ?? null;
}

function directionTone(dir: string | undefined): PillTone {
  const d = (dir || "").toLowerCase();
  if (d === "long" || d === "buy") return "ok";
  if (d === "short" || d === "sell") return "crit";
  return "neutral";
}

function directionColorVar(dir: string | undefined): string {
  const d = (dir || "").toLowerCase();
  if (d === "long" || d === "buy") return "var(--color-gain)";
  if (d === "short" || d === "sell") return "var(--color-loss)";
  return "var(--color-muted)";
}

function StepTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[9.5px] font-semibold uppercase tracking-[0.14em]"
      style={{ color: "var(--color-muted)" }}
    >
      {children}
    </div>
  );
}

function StepShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="w-full min-w-0 rounded-xl p-3.5 flex flex-col gap-2.5"
      style={{
        border: "1px solid var(--color-rule)",
        background: "var(--color-surface)",
      }}
    >
      {children}
    </div>
  );
}

function StepDivider() {
  return (
    <div
      aria-hidden="true"
      className="hidden md:flex shrink-0 items-center justify-center"
      style={{ width: 22, color: "var(--color-muted-soft)" }}
    >
      <ArrowRight size={14} strokeWidth={2} />
    </div>
  );
}

function SignalBar({ signal }: { signal: Signal }) {
  const color = directionColorVar(signal.direction);
  const confidence = Math.max(0, Math.min(100, Number(signal.confidence) || 0));
  return (
    <div className="flex items-center gap-2 text-[10.5px]">
      <span
        className="truncate"
        style={{ color: "var(--color-ink-soft)", flex: "0 0 68px" }}
      >
        {signal.agent_name}
      </span>
      <div
        className="relative flex-1 overflow-hidden rounded-full"
        style={{
          height: 4,
          background: "var(--color-rule)",
        }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${confidence}%`,
            background: color,
            transition: "width 400ms cubic-bezier(0.25,0.1,0.25,1)",
          }}
        />
      </div>
      <span
        className="num tabular-nums"
        style={{ color: "var(--color-muted)", flex: "0 0 22px", textAlign: "right" }}
      >
        {Math.round(confidence)}
      </span>
    </div>
  );
}

function SignalsStep({ signals }: { signals: Signal[] | undefined }) {
  return (
    <StepShell>
      <StepTitle>1 &middot; 6 specialist agents</StepTitle>
      {signals && signals.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {signals.slice(0, 6).map((s, i) => (
            <SignalBar key={`${s.agent_name}-${i}`} signal={s} />
          ))}
        </div>
      ) : (
        <div
          className="text-[11px]"
          style={{ color: "var(--color-muted-soft)" }}
        >
          No signal snapshot in artifact.
        </div>
      )}
    </StepShell>
  );
}

function ConvictionStep({
  rationale,
  conviction,
  direction,
}: {
  rationale: string | undefined;
  conviction: number | undefined;
  direction: string | undefined;
}) {
  const c =
    conviction != null && Number.isFinite(Number(conviction))
      ? Math.max(0, Math.min(100, Number(conviction)))
      : null;
  const summary = (rationale || "").split(/\.\s|\n/)[0]?.trim() || "";
  return (
    <StepShell>
      <StepTitle>2 &middot; LLM analyst</StepTitle>
      <div className="flex items-baseline gap-2">
        <span
          className="num text-[26px] font-semibold leading-none tabular-nums"
          style={{ color: "var(--color-ink)" }}
        >
          {c != null ? Math.round(c) : "—"}
        </span>
        <span
          className="text-[9.5px] uppercase tracking-[0.1em]"
          style={{ color: "var(--color-muted)" }}
        >
          conviction
        </span>
      </div>
      <div
        className="relative overflow-hidden rounded-full"
        style={{ height: 4, background: "var(--color-rule)" }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${c ?? 0}%`,
            background: directionColorVar(direction),
            transition: "width 500ms cubic-bezier(0.25,0.1,0.25,1)",
          }}
        />
      </div>
      <div
        className="text-[11px] leading-snug line-clamp-3"
        style={{ color: "var(--color-ink-soft)" }}
        title={rationale || undefined}
      >
        {summary || (
          <span style={{ color: "var(--color-muted-soft)" }}>
            No rationale recorded.
          </span>
        )}
      </div>
    </StepShell>
  );
}

function KillGatesStep({ kills }: { kills: KillCriteria | undefined }) {
  const tripped = kills
    ? KILL_GATES.filter((g) => kills[g.key] === true).length
    : 0;
  return (
    <StepShell>
      <div className="flex items-center justify-between gap-2">
        <StepTitle>3 &middot; Risk governor &mdash; 7 gates</StepTitle>
        <StatusPill
          tone={tripped === 0 ? "ok" : "crit"}
          label={tripped === 0 ? "PASS" : `${tripped} TRIP`}
        />
      </div>
      <div className="grid grid-cols-7 gap-1.5 pt-0.5">
        {KILL_GATES.map((g) => {
          const bad = kills?.[g.key] === true;
          return (
            <span
              key={g.key}
              title={`${g.label}: ${bad ? "TRIPPED" : "OK"}`}
              aria-label={`${g.label}: ${bad ? "tripped" : "ok"}`}
              className="block w-full rounded-full"
              style={{
                height: 10,
                background: bad ? "var(--color-loss)" : "var(--color-gain)",
                boxShadow: bad
                  ? "0 0 0 2px var(--color-loss-soft)"
                  : "0 0 0 2px var(--color-gain-soft)",
              }}
            />
          );
        })}
      </div>
      <div
        className="text-[10.5px]"
        style={{ color: "var(--color-muted)" }}
      >
        {tripped === 0
          ? "All seven kill gates clear"
          : `${tripped} of 7 gates blocking execution`}
      </div>
    </StepShell>
  );
}

function IntentStep({ artifact }: { artifact: Artifact }) {
  const intent = artifact.payload?.intent;
  const decision = artifact.payload?.risk_decision;
  const pair = intent?.pair || artifact.payload?.pair || "";
  const side = intent?.side || decision?.final_side || "";
  const sizeUsd =
    intent?.size_usd ?? decision?.final_size_usd ?? null;
  const score = intent?.signal_score ?? null;
  const eligible = intent?.erc_eligible ?? null;

  return (
    <StepShell>
      <StepTitle>4 &middot; Trade intent</StepTitle>
      <div className="flex items-center gap-2">
        <span
          className="text-[13px] font-semibold tracking-tight"
          style={{ color: "var(--color-ink)" }}
        >
          {pair || "—"}
        </span>
        {side ? (
          <StatusPill tone={directionTone(side)} label={side.toUpperCase()} />
        ) : null}
      </div>
      <div className="flex flex-col gap-1 text-[11px]">
        <div className="flex items-center justify-between">
          <span style={{ color: "var(--color-muted)" }}>Size</span>
          <span
            className="num tabular-nums"
            style={{ color: "var(--color-ink)" }}
          >
            {sizeUsd != null ? fmtUsd(Number(sizeUsd)) : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span style={{ color: "var(--color-muted)" }}>Signal score</span>
          <span
            className="num tabular-nums"
            style={{ color: "var(--color-ink)" }}
          >
            {score != null ? Math.round(Number(score)) : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span style={{ color: "var(--color-muted)" }}>ERC-8004</span>
          {eligible == null ? (
            <span style={{ color: "var(--color-muted-soft)" }}>—</span>
          ) : (
            <StatusPill
              tone={eligible ? "info" : "neutral"}
              label={eligible ? "ELIGIBLE" : "PAPER"}
            />
          )}
        </div>
      </div>
    </StepShell>
  );
}

function AttestationStep({
  attestation,
}: {
  attestation: Attestation | null;
}) {
  return (
    <StepShell>
      <StepTitle>5 &middot; ERC-8004 attestation</StepTitle>
      {attestation ? (
        <>
          <div className="flex items-center gap-2">
            <span
              className="num text-[12px] tabular-nums"
              style={{ color: "var(--color-ink)" }}
            >
              {fmtHashShort(attestation.tx_hash, 6)}
            </span>
            <button
              type="button"
              aria-label="View transaction on Etherscan"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.open(etherscanTx(attestation.tx_hash), "_blank", "noopener,noreferrer");
              }}
              className="inline-flex items-center cursor-pointer bg-transparent border-0 p-0"
              style={{ color: "var(--color-accent)" }}
            >
              <ExternalLink size={12} />
            </button>
          </div>
          <div className="flex flex-col gap-1 text-[11px]">
            <div className="flex items-center justify-between">
              <span style={{ color: "var(--color-muted)" }}>Kind</span>
              <span
                className="uppercase tracking-[0.06em]"
                style={{ color: "var(--color-ink-soft)" }}
              >
                {attestation.kind.replace(/_/g, " ")}
              </span>
            </div>
            {attestation.score != null && (
              <div className="flex items-center justify-between">
                <span style={{ color: "var(--color-muted)" }}>Validation</span>
                <span
                  className="num tabular-nums"
                  style={{ color: "var(--color-ink)" }}
                >
                  {Math.round(Number(attestation.score))}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span style={{ color: "var(--color-muted)" }}>Time</span>
              <span
                className="num tabular-nums"
                style={{ color: "var(--color-ink-soft)" }}
              >
                {fmtRelative(attestation.timestamp)}
              </span>
            </div>
          </div>
        </>
      ) : (
        <>
          <div
            className="text-[12px] italic"
            style={{ color: "var(--color-muted)" }}
          >
            paper trade
          </div>
          <div
            className="text-[10.5px]"
            style={{ color: "var(--color-muted-soft)" }}
          >
            Not submitted on-chain.
          </div>
        </>
      )}
    </StepShell>
  );
}

function WalkthroughSkeleton() {
  return (
    <div className="flex flex-col md:flex-row md:items-stretch gap-3 md:gap-0">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="contents">
          <div className="flex-1 min-w-0 flex items-stretch">
            <div
              className="w-full min-w-0 rounded-xl p-3.5 flex flex-col gap-2.5"
              style={{
                border: "1px solid var(--color-rule)",
                background: "var(--color-surface)",
              }}
            >
              <Skeleton width={96} height={10} />
              <Skeleton width="100%" height={14} />
              <Skeleton width="80%" height={10} />
              <Skeleton width="60%" height={10} />
            </div>
          </div>
          {i < 4 && <StepDivider />}
        </div>
      ))}
    </div>
  );
}

function Header({
  timestamp,
  pair,
  rightSlot,
}: {
  timestamp?: string;
  pair?: string;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pb-3 mb-3.5 border-b border-[color:var(--color-rule)]">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="live-dot inline-block rounded-full"
          style={{
            width: 7,
            height: 7,
            background: "var(--color-gain)",
            boxShadow: "0 0 0 3px var(--color-gain-soft)",
          }}
        />
        <h3
          className="text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: "var(--color-ink-soft)" }}
        >
          Latest Decision Walkthrough
        </h3>
        {pair && (
          <span
            className="text-[10px] font-medium tracking-tight"
            style={{ color: "var(--color-muted)" }}
          >
            {pair}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {timestamp && (
          <span
            className="num text-[10.5px] tabular-nums"
            style={{ color: "var(--color-muted)" }}
          >
            {fmtRelative(timestamp)}
          </span>
        )}
        {rightSlot}
      </div>
    </div>
  );
}

function ReplayButton({
  onClick,
  playing,
  disabled,
}: {
  onClick: () => void;
  playing: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || playing}
      aria-label="Replay last decision"
      className="cursor-pointer inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] transition-[background-color,border-color,color,transform] duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)] hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      style={{
        borderColor: playing
          ? "var(--color-accent)"
          : "var(--color-rule-strong)",
        color: playing ? "var(--color-accent)" : "var(--color-ink-soft)",
        background: "transparent",
      }}
    >
      <Play size={11} strokeWidth={2.4} />
      {playing ? "Replaying" : "Replay last decision"}
    </button>
  );
}

export default function DecisionWalkthrough() {
  const { data: artifacts, isLoading: artifactsLoading } = useArtifacts(50);
  const { data: kills } = useKillCriteria();
  const { data: onchain } = useOnchainStatus();
  const reduceMotion = useReducedMotion();

  const [replayKey, setReplayKey] = useState(0);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [replaying, setReplaying] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current = [];
    };
  }, []);

  const artifact = useMemo(() => pickWalkthroughArtifact(artifacts), [artifacts]);

  const attestation = useMemo<Attestation | null>(() => {
    if (!artifact || !onchain?.recent_attestations) return null;
    const match = onchain.recent_attestations.find(
      (a) => a.artifact_hash && a.artifact_hash === artifact.hash,
    );
    return match ?? null;
  }, [artifact, onchain]);

  const handleReplay = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];

    if (reduceMotion) {
      setReplayKey((k) => k + 1);
      setActiveStep(null);
      setReplaying(false);
      return;
    }

    setReplayKey((k) => k + 1);
    setReplaying(true);
    setActiveStep(0);

    const stepCount = 5;
    const stagger = 300;
    for (let i = 1; i < stepCount; i += 1) {
      timersRef.current.push(
        setTimeout(() => setActiveStep(i), i * stagger),
      );
    }
    timersRef.current.push(
      setTimeout(
        () => {
          setActiveStep(null);
          setReplaying(false);
        },
        stepCount * stagger + 200,
      ),
    );
  }, [reduceMotion]);

  const loading = artifactsLoading && !artifact;

  if (loading) {
    return (
      <HairlineCard>
        <Header />
        <WalkthroughSkeleton />
      </HairlineCard>
    );
  }

  if (!artifact) {
    return (
      <HairlineCard>
        <Header />
        <EmptyState
          label="No decisions yet"
          sub="Waiting for the next strategic cycle."
        />
      </HairlineCard>
    );
  }

  const analyst = artifact.payload?.analyst;
  const signals = artifact.payload?.signals;
  const pair =
    artifact.payload?.pair ||
    artifact.payload?.intent?.pair ||
    "";

  const containerVariants: Variants = {
    hidden: { opacity: reduceMotion ? 1 : 0 },
    show: {
      opacity: 1,
      transition: reduceMotion
        ? { duration: 0 }
        : { staggerChildren: 0.07, delayChildren: 0.02 },
    },
  };

  const itemVariants: Variants = reduceMotion
    ? { hidden: { opacity: 1, y: 0 }, show: { opacity: 1, y: 0 } }
    : {
        hidden: { opacity: 0, y: 8, scale: 1 },
        show: {
          opacity: 1,
          y: 0,
          scale: [1, 1.02, 1],
          transition: {
            duration: 0.32,
            ease: [0.25, 0.1, 0.25, 1],
            scale: { duration: 0.32, times: [0, 0.6, 1] },
          },
        },
      };

  const steps: Array<{
    key: string;
    href: string;
    ariaLabel: string;
    node: React.ReactNode;
  }> = [
    {
      key: "signals",
      href: "/signals",
      ariaLabel: "View all signal agents",
      node: <SignalsStep signals={signals} />,
    },
    {
      key: "conviction",
      href: "/signals",
      ariaLabel: "View LLM analyst rationale",
      node: (
        <ConvictionStep
          rationale={analyst?.rationale}
          conviction={analyst?.conviction}
          direction={analyst?.direction}
        />
      ),
    },
    {
      key: "gates",
      href: "/risk",
      ariaLabel: "View risk governor kill gates",
      node: <KillGatesStep kills={kills} />,
    },
    {
      key: "intent",
      href: "/positions",
      ariaLabel: "View trade intent and positions",
      node: <IntentStep artifact={artifact} />,
    },
    {
      key: "attestation",
      href: "/attestations",
      ariaLabel: "View ERC-8004 attestations",
      node: <AttestationStep attestation={attestation} />,
    },
  ];

  return (
    <HairlineCard>
      <Header
        timestamp={artifact.timestamp}
        pair={pair}
        rightSlot={
          <ReplayButton
            onClick={handleReplay}
            playing={replaying}
            disabled={!artifact}
          />
        }
      />
      <motion.div
        key={replayKey}
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="flex flex-col md:flex-row md:items-stretch gap-3 md:gap-0"
      >
        {steps.map((step, i) => {
          const isActive = activeStep === i;
          const breath =
            !reduceMotion && isActive
              ? { opacity: [0.95, 1, 0.95] }
              : undefined;
          return (
            <div key={`wrap-${step.key}`} className="contents">
              <motion.div
                variants={itemVariants}
                animate={breath}
                transition={
                  breath
                    ? {
                        opacity: {
                          duration: 3,
                          repeat: Infinity,
                          ease: "easeInOut",
                        },
                      }
                    : undefined
                }
                className="flex-1 min-w-0 flex items-stretch"
                style={
                  isActive
                    ? {
                        boxShadow:
                          "0 0 0 2px var(--color-accent), 0 6px 18px rgba(0,0,0,0.08)",
                        borderRadius: 12,
                      }
                    : undefined
                }
              >
                <Link
                  href={step.href}
                  prefetch={true}
                  aria-label={step.ariaLabel}
                  className="w-full min-w-0 flex items-stretch rounded-xl transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)] hover:-translate-y-px hover:shadow-[0_0_0_1px_var(--color-accent),0_6px_18px_rgba(0,0,0,0.05)] focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-accent)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  {step.node}
                </Link>
              </motion.div>
              {i < steps.length - 1 && <StepDivider />}
            </div>
          );
        })}
      </motion.div>
    </HairlineCard>
  );
}

export { DecisionWalkthrough };
