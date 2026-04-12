"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import { AuroraBackground } from "@/components/ui/aurora-background";
import { Skeleton } from "@/components/ui/Skeleton";
import { useOnchainStatus, useRegime, useStats } from "@/lib/hooks";

const LIVE_URL = "https://praxis-agent.site";
const REPO_URL = "https://github.com/javierdejesusda/praxis-agent";

function GithubMark({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .5C5.73.5.75 5.48.75 11.75c0 4.98 3.23 9.2 7.71 10.7.56.1.77-.25.77-.55 0-.27-.01-1.17-.02-2.12-3.14.68-3.8-1.34-3.8-1.34-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.14.08 1.73 1.17 1.73 1.17 1 1.72 2.64 1.22 3.28.93.1-.73.39-1.22.71-1.5-2.5-.28-5.14-1.25-5.14-5.57 0-1.23.44-2.24 1.17-3.03-.12-.29-.51-1.44.11-3 0 0 .95-.3 3.12 1.15.9-.25 1.87-.37 2.83-.38.96.01 1.93.13 2.83.38 2.17-1.45 3.12-1.15 3.12-1.15.62 1.56.23 2.71.11 3 .73.79 1.17 1.8 1.17 3.03 0 4.33-2.65 5.29-5.17 5.57.41.35.77 1.04.77 2.1 0 1.52-.01 2.74-.01 3.11 0 .3.2.66.78.55 4.48-1.5 7.7-5.72 7.7-10.7C23.25 5.48 18.27.5 12 .5z" />
    </svg>
  );
}

function MetricCard({
  label,
  value,
  sub,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
}) {
  return (
    <div
      className="flex-1 min-w-[140px] rounded-2xl border border-[color:var(--color-rule)] px-5 py-4 text-left"
      style={{
        background: "var(--color-surface)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
      }}
    >
      <div className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-muted)] font-medium">
        {label}
      </div>
      <div className="mt-2 num text-[22px] md:text-[26px] font-semibold tracking-[-0.02em] text-[color:var(--color-ink)]">
        {loading ? <Skeleton width={80} height={24} /> : value}
      </div>
      {sub ? (
        <div className="mt-1 num text-[11px] text-[color:var(--color-muted)]">
          {loading ? <Skeleton width={60} height={11} /> : sub}
        </div>
      ) : null}
    </div>
  );
}

export default function HeroPage() {
  const { data: regime, isLoading: regimeLoading } = useRegime();
  const { data: stats, isLoading: statsLoading } = useStats();
  const { data: onchain, isLoading: onchainLoading } = useOnchainStatus();

  const regimeLabel = regime?.regime ? regime.regime.toUpperCase() : "UNKNOWN";
  const adxLabel =
    typeof regime?.adx === "number" && Number.isFinite(regime.adx)
      ? `ADX ${regime.adx.toFixed(1)}`
      : "ADX —";
  const validationPct =
    typeof stats?.validation_rate === "number"
      ? `${stats.validation_rate.toFixed(stats.validation_rate >= 10 ? 0 : 1)}%`
      : "—";
  const attestations =
    typeof onchain?.total_attestations === "number"
      ? onchain.total_attestations.toLocaleString()
      : "—";

  return (
    <AuroraBackground>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="relative z-10 w-full max-w-4xl px-5 md:px-8 flex flex-col items-center text-center"
      >
        <div className="text-[10px] md:text-[11px] uppercase tracking-[0.22em] font-medium text-[color:var(--color-muted)]">
          ERC-8004 &middot; Sepolia &middot; Paper trading
        </div>

        <h1
          className="mt-5 font-semibold tracking-[-0.045em] text-[color:var(--color-ink)]"
          style={{ fontSize: "clamp(56px, 12vw, 128px)", lineHeight: 0.92 }}
        >
          Praxis
        </h1>

        <p className="mt-3 text-[color:var(--color-ink-soft)] font-light text-[18px] md:text-[22px]">
          Regime-adaptive crypto trading agent
        </p>

        <p className="mt-6 max-w-2xl text-[14px] md:text-[16px] text-[color:var(--color-muted)] leading-relaxed">
          82.5 bps minimum edge. 6 specialist agents. Every decision signed
          on-chain.
        </p>

        <div className="mt-10 w-full flex flex-col sm:flex-row gap-3 md:gap-4">
          <MetricCard
            label="Current regime"
            value={regimeLabel}
            sub={adxLabel}
            loading={regimeLoading}
          />
          <MetricCard
            label="Validation rate"
            value={validationPct}
            sub="ERC-8004 eligible"
            loading={statsLoading}
          />
          <MetricCard
            label="Attestations"
            value={attestations}
            sub="Total on-chain"
            loading={onchainLoading}
          />
        </div>

        <div className="mt-10 flex flex-col sm:flex-row items-center gap-3">
          <Link
            href="/overview"
            className="group inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-medium text-[color:var(--color-paper)] transition-transform hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-accent)] focus-visible:outline-offset-2"
            style={{ background: "var(--color-ink)" }}
          >
            Enter live dashboard
            <ArrowRight
              size={15}
              strokeWidth={1.75}
              className="transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </Link>
          <Link
            href="/backtest"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-medium border border-[color:var(--color-rule-strong)] text-[color:var(--color-ink)] hover:bg-[color:var(--color-hover)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-accent)] focus-visible:outline-offset-2"
          >
            See backtest
          </Link>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-medium border border-[color:var(--color-rule-strong)] text-[color:var(--color-ink)] hover:bg-[color:var(--color-hover)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-accent)] focus-visible:outline-offset-2"
          >
            <GithubMark size={15} />
            View on GitHub
          </a>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.6 }}
        className="hidden sm:flex absolute bottom-6 right-6 z-10 items-center gap-3 rounded-xl border border-[color:var(--color-rule)] px-3 py-2"
        style={{
          background: "var(--color-surface)",
          backdropFilter: "saturate(180%) blur(16px)",
          WebkitBackdropFilter: "saturate(180%) blur(16px)",
        }}
      >
        <div
          className="rounded-md p-1 text-[color:var(--color-ink)]"
          style={{ background: "var(--color-bone)" }}
        >
          <QRCodeSVG
            value={LIVE_URL}
            size={72}
            bgColor="transparent"
            fgColor="currentColor"
            level="M"
          />
        </div>
        <div className="flex flex-col text-left">
          <span className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-muted)] font-medium">
            Scan for live dashboard
          </span>
          <span className="num text-[11px] text-[color:var(--color-ink-soft)]">
            praxis-agent.site
          </span>
        </div>
      </motion.div>
    </AuroraBackground>
  );
}
