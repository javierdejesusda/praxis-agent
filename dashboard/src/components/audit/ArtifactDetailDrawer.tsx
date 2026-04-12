"use client";

import {useEffect, useMemo, useRef} from "react";
import {AnimatePresence, motion} from "framer-motion";
import {ExternalLink, X} from "lucide-react";
import {toast} from "sonner";

import {CopyButton} from "@/components/ui/CopyButton";
import {StatusPill, type PillTone} from "@/components/ui/StatusPill";
import type {Artifact} from "@/lib/api";
import {etherscanTx, shortHash} from "@/lib/chain";
import {formatTimestamp, useTimezoneMode} from "@/lib/timezone";

type Props = {
  artifact: Artifact | null;
  onClose: () => void;
};

function typeTone(type: string): PillTone {
  if (type === "trade-execution") return "ok";
  if (type === "no-trade") return "crit";
  return "neutral";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const KEY_COLOR = "var(--color-accent)";
const STR_COLOR = "var(--color-gain)";
const NUM_COLOR = "var(--color-ink)";
const BOOL_COLOR = "var(--color-warn)";

function colorizeJson(raw: string): string {
  let out = "";
  let i = 0;
  const len = raw.length;
  while (i < len) {
    const ch = raw[i];
    if (ch === '"') {
      let end = i + 1;
      while (end < len) {
        if (raw[end] === "\\") {
          end += 2;
          continue;
        }
        if (raw[end] === '"') break;
        end += 1;
      }
      const strToken = raw.slice(i, end + 1);
      let j = end + 1;
      while (j < len && (raw[j] === " " || raw[j] === "\t")) j += 1;
      const isKey = raw[j] === ":";
      const color = isKey ? KEY_COLOR : STR_COLOR;
      out += `<span style="color:${color}">${escapeHtml(strToken)}</span>`;
      i = end + 1;
      continue;
    }
    const prev = i === 0 ? "" : raw[i - 1];
    const numMatch = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(raw.slice(i));
    if (numMatch && (prev === "" || /[\s,:\[\{]/.test(prev))) {
      out += `<span style="color:${NUM_COLOR}">${escapeHtml(numMatch[0])}</span>`;
      i += numMatch[0].length;
      continue;
    }
    if (raw.startsWith("true", i) || raw.startsWith("null", i)) {
      const word = raw.startsWith("true", i) ? "true" : "null";
      out += `<span style="color:${BOOL_COLOR}">${word}</span>`;
      i += word.length;
      continue;
    }
    if (raw.startsWith("false", i)) {
      out += `<span style="color:${BOOL_COLOR}">false</span>`;
      i += 5;
      continue;
    }
    out += escapeHtml(ch);
    i += 1;
  }
  return out;
}

type HashFind = {hash: string; path: string};

function findTxHashes(value: unknown, path: string[] = []): HashFind[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    const out: HashFind[] = [];
    for (let idx = 0; idx < value.length; idx += 1) {
      out.push(...findTxHashes(value[idx], [...path, String(idx)]));
    }
    return out;
  }
  if (typeof value === "object") {
    const out: HashFind[] = [];
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const lk = k.toLowerCase();
      if (
        (lk === "txhash" || lk === "tx_hash") &&
        typeof v === "string" &&
        v.startsWith("0x")
      ) {
        out.push({hash: v, path: [...path, k].join(".")});
      } else {
        out.push(...findTxHashes(v, [...path, k]));
      }
    }
    return out;
  }
  return [];
}

export function ArtifactDetailDrawer({artifact, onClose}: Props) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const tzMode = useTimezoneMode();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!artifact) return;
    if (previousFocusRef.current == null) {
      previousFocusRef.current =
        (document.activeElement as HTMLElement | null) ?? null;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const id = window.setTimeout(() => closeButtonRef.current?.focus(), 30);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(id);
    };
  }, [artifact]);

  const handleExitComplete = () => {
    const target = previousFocusRef.current;
    previousFocusRef.current = null;
    if (target && typeof target.focus === "function") {
      target.focus();
    }
  };

  const rawJson = useMemo(
    () => (artifact ? JSON.stringify(artifact, null, 2) : ""),
    [artifact],
  );
  const coloredJson = useMemo(
    () => (rawJson ? colorizeJson(rawJson) : ""),
    [rawJson],
  );
  const txHashes = useMemo(
    () => (artifact ? findTxHashes(artifact.payload) : []),
    [artifact],
  );

  const handleCopyAll = async () => {
    if (!rawJson) return;
    try {
      await navigator.clipboard.writeText(rawJson);
      toast.success("Artifact JSON copied");
    } catch {
      toast.error("Clipboard blocked");
    }
  };

  return (
    <AnimatePresence onExitComplete={handleExitComplete}>
      {artifact && (
        <>
          <motion.div
            key="backdrop"
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{duration: 0.15}}
            onClick={onClose}
            aria-hidden="true"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.32)",
              zIndex: 70,
            }}
          />
          <motion.aside
            key="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Artifact detail"
            initial={{x: 320}}
            animate={{x: 0}}
            exit={{x: 320}}
            transition={{type: "tween", duration: 0.2, ease: [0.22, 1, 0.36, 1]}}
            className="artifact-drawer"
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              height: "100vh",
              width: 520,
              maxWidth: "100vw",
              background: "var(--color-surface-solid)",
              borderLeft: "1px solid var(--color-rule-strong)",
              boxShadow: "-8px 0 32px rgba(0,0,0,0.18)",
              zIndex: 80,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <header
              className="flex items-start justify-between gap-3"
              style={{
                padding: "14px 16px",
                borderBottom: "1px solid var(--color-rule)",
              }}
            >
              <div className="flex flex-col gap-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <StatusPill
                    tone={typeTone(artifact.type)}
                    label={artifact.type.toUpperCase()}
                  />
                  <span
                    className="num text-[11px]"
                    style={{color: "var(--color-muted)"}}
                  >
                    {formatTimestamp(artifact.timestamp, tzMode)}
                  </span>
                </div>
                <span
                  className="num text-[11px] truncate"
                  style={{color: "var(--color-ink-soft)"}}
                  title={artifact.hash}
                >
                  {shortHash(artifact.hash, 10, 8)}
                </span>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label="Close artifact detail"
                className="rounded-md cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)]"
                style={{
                  padding: 6,
                  background: "transparent",
                  border: "1px solid var(--color-rule)",
                  color: "var(--color-ink-soft)",
                }}
              >
                <X size={16} strokeWidth={2} />
              </button>
            </header>

            <div
              className="flex-1 overflow-y-auto flex flex-col gap-3"
              style={{padding: 16}}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-[10px] uppercase tracking-[0.1em] font-semibold"
                  style={{color: "var(--color-muted)"}}
                >
                  Payload JSON
                </span>
                <button
                  type="button"
                  onClick={handleCopyAll}
                  className="text-[11px] font-mono cursor-pointer rounded-md border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)]"
                  style={{
                    padding: "4px 10px",
                    background: "var(--color-surface)",
                    borderColor: "var(--color-rule)",
                    color: "var(--color-ink)",
                  }}
                  aria-label="Copy full JSON"
                >
                  Copy JSON
                </button>
              </div>
              <pre
                className="font-mono text-[11px] leading-[1.55] rounded-xl overflow-auto"
                style={{
                  background: "var(--color-paper)",
                  border: "1px solid var(--color-rule)",
                  color: "var(--color-ink)",
                  padding: "12px 14px",
                  maxHeight: "calc(100vh - 280px)",
                  whiteSpace: "pre",
                  fontFamily: "var(--font-mono), ui-monospace, monospace",
                }}
                dangerouslySetInnerHTML={{__html: coloredJson}}
              />

              {txHashes.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span
                    className="text-[10px] uppercase tracking-[0.1em] font-semibold"
                    style={{color: "var(--color-muted)"}}
                  >
                    On-chain
                  </span>
                  {txHashes.map((t) => (
                    <div
                      key={t.path}
                      className="flex items-center justify-between gap-3 text-[11px]"
                      style={{color: "var(--color-ink-soft)"}}
                    >
                      <CopyButton value={t.hash} truncate={14} />
                      <a
                        href={etherscanTx(t.hash)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)] rounded-md px-1"
                        style={{color: "var(--color-accent)"}}
                        aria-label="Open on Etherscan"
                      >
                        Open on Etherscan
                        <ExternalLink size={11} strokeWidth={2} />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.aside>
          <style jsx>{`
            @media (max-width: 640px) {
              .artifact-drawer {
                width: 100vw !important;
              }
            }
            @media (prefers-reduced-motion: reduce) {
              .artifact-drawer {
                transition: none !important;
              }
            }
          `}</style>
        </>
      )}
    </AnimatePresence>
  );
}
