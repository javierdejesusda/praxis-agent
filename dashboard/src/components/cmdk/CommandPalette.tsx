"use client";

import {
  Activity,
  BookOpen,
  BrainCircuit,
  Briefcase,
  Clock,
  FileText,
  Hash,
  Keyboard,
  LayoutDashboard,
  LineChart,
  Moon,
  ShieldAlert,
  Stamp,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";

import { setHowItWorksOpen } from "@/components/how-it-works/how-it-works-store";
import { setShortcutsOpen } from "@/components/shortcuts/shortcuts-store";
import { useArtifacts } from "@/lib/hooks";
import { toggleTimezoneMode } from "@/lib/timezone";

import {
  setCommandOpen,
  toggleCommand,
  useCommandOpen,
} from "./command-store";

type CommandKind = "nav" | "action" | "artifact";
type SectionKey = "Navigation" | "Actions" | "Artifacts";

interface CommandItem {
  id: string;
  kind: CommandKind;
  section: SectionKey;
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
}

const NAV_ROUTES: {
  href: string;
  label: string;
  icon: LucideIcon;
}[] = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/agents", label: "Agents", icon: BrainCircuit },
  { href: "/positions", label: "Positions", icon: Briefcase },
  { href: "/signals", label: "Signals", icon: Activity },
  { href: "/backtest", label: "Backtest", icon: LineChart },
  { href: "/risk", label: "Risk", icon: ShieldAlert },
  { href: "/attestations", label: "Attestations", icon: Stamp },
  { href: "/audit", label: "Audit", icon: FileText },
];

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

export function CommandPalette() {
  const open = useCommandOpen();

  // Global hotkey listener. This effect only wires the DOM listener and
  // the listener mutates the module-level store — no React setState here,
  // so the Next 16 React Compiler is happy.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        toggleCommand();
        return;
      }
      if (e.key === "Escape") {
        setCommandOpen(false);
        return;
      }
      if (e.key === "/" && !isEditableTarget(e.target)) {
        e.preventDefault();
        setCommandOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;
  return <CommandPaletteModal />;
}

function CommandPaletteModal() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { data: artifacts } = useArtifacts(100);

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Mount-once effect: capture prior focus, lock body scroll, focus input.
  // Restores on unmount when the modal closes.
  useEffect(() => {
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
      const prev = previouslyFocused.current;
      if (prev && document.contains(prev)) {
        prev.focus();
      }
    };
  }, []);

  const items = useMemo<CommandItem[]>(() => {
    const q = query.trim().toLowerCase();

    const navItems: CommandItem[] = NAV_ROUTES.map((r) => ({
      id: `nav:${r.href}`,
      kind: "nav",
      section: "Navigation",
      label: r.label,
      hint: r.href,
      icon: r.icon,
      run: () => {
        router.push(r.href);
        setCommandOpen(false);
      },
    }));

    const themeLabel =
      resolvedTheme === "dark"
        ? "Switch theme to light"
        : "Switch theme to dark";
    const actionItems: CommandItem[] = [
      {
        id: "action:theme",
        kind: "action",
        section: "Actions",
        label: themeLabel,
        hint: "Toggle theme",
        icon: resolvedTheme === "dark" ? Sun : Moon,
        run: () => {
          setTheme(resolvedTheme === "dark" ? "light" : "dark");
          setCommandOpen(false);
        },
      },
      {
        id: "action:timezone",
        kind: "action",
        section: "Actions",
        label: "Toggle timezone (UTC / Local)",
        hint: "Toggle timezone",
        icon: Clock,
        run: () => {
          toggleTimezoneMode();
          setCommandOpen(false);
        },
      },
      {
        id: "action:how-it-works",
        kind: "action",
        section: "Actions",
        label: "How it works",
        hint: "Architecture overview",
        icon: BookOpen,
        run: () => {
          setCommandOpen(false);
          setHowItWorksOpen(true);
        },
      },
      {
        id: "action:shortcuts",
        kind: "action",
        section: "Actions",
        label: "Keyboard shortcuts",
        hint: "Press ?",
        icon: Keyboard,
        run: () => {
          setCommandOpen(false);
          setShortcutsOpen(true);
        },
      },
      {
        id: "action:replay-tour",
        kind: "action",
        section: "Actions",
        label: "Replay welcome tour",
        hint: "Onboarding",
        icon: BookOpen,
        run: () => {
          if (typeof window !== "undefined") {
            try {
              window.localStorage.removeItem("praxis-onboarding-v1");
            } catch {
              // ignore
            }
            setCommandOpen(false);
            window.location.assign("/overview");
          }
        },
      },
    ];

    const filterMatch = (label: string) =>
      q.length === 0 || label.toLowerCase().includes(q);

    const filteredNav = navItems.filter((i) => filterMatch(i.label));
    const filteredActions = actionItems.filter((i) => filterMatch(i.label));

    let artifactItems: CommandItem[] = [];
    if (q.length >= 4 && artifacts && artifacts.length > 0) {
      artifactItems = artifacts
        .filter((a) => a.hash && a.hash.toLowerCase().includes(q))
        .slice(0, 5)
        .map((a) => {
          const shortHash = a.hash.slice(0, 12);
          return {
            id: `artifact:${a.hash}`,
            kind: "artifact",
            section: "Artifacts",
            label: shortHash,
            hint: a.type,
            icon: Hash,
            run: () => {
              router.push(`/audit?hash=${shortHash}`);
              setCommandOpen(false);
            },
          };
        });
    }

    return [...filteredNav, ...filteredActions, ...artifactItems];
  }, [query, artifacts, resolvedTheme, router, setTheme]);

  const clampedIndex =
    items.length === 0 ? 0 : Math.min(selectedIndex, items.length - 1);

  const grouped = useMemo(() => {
    const map = new Map<SectionKey, CommandItem[]>();
    for (const item of items) {
      const arr = map.get(item.section) ?? [];
      arr.push(item);
      map.set(item.section, arr);
    }
    return Array.from(map.entries());
  }, [items]);

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) =>
        items.length === 0 ? 0 : (i + 1) % items.length,
      );
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) =>
        items.length === 0 ? 0 : (i - 1 + items.length) % items.length,
      );
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const item = items[clampedIndex];
      if (item) item.run();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setCommandOpen(false);
    }
  };

  let flatIndex = 0;
  const activeId = items[clampedIndex]?.id;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-16 px-4"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={() => setCommandOpen(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="praxis-cmdk-title"
        className="w-full max-w-[640px] rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: "var(--color-surface-solid)",
          border: "1px solid var(--color-rule-strong)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="praxis-cmdk-title" className="sr-only">
          Command palette
        </h2>
        <div
          className="px-4 py-3 border-b"
          style={{ borderColor: "var(--color-rule)" }}
        >
          <input
            ref={inputRef}
            type="text"
            autoFocus
            spellCheck={false}
            autoComplete="off"
            placeholder="Jump anywhere…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={onInputKeyDown}
            aria-label="Command palette search"
            aria-controls="praxis-cmdk-list"
            aria-activedescendant={
              activeId ? `cmdk-item-${activeId}` : undefined
            }
            className="w-full bg-transparent outline-none font-mono text-[14px] leading-6"
            style={{ color: "var(--color-ink)" }}
          />
        </div>
        <div
          className="px-4 py-1.5 text-[10px] uppercase tracking-[0.14em] border-b font-medium"
          style={{
            color: "var(--color-muted-soft)",
            borderColor: "var(--color-rule)",
            background: "var(--color-surface)",
          }}
        >
          <span className="num">↑↓</span> to move{" "}
          <span style={{ color: "var(--color-muted)" }}>·</span>{" "}
          <span className="num">↵</span> to select{" "}
          <span style={{ color: "var(--color-muted)" }}>·</span>{" "}
          <span className="num">esc</span> to close
        </div>
        <div
          id="praxis-cmdk-list"
          role="listbox"
          aria-label="Results"
          className="max-h-[52vh] overflow-y-auto py-2"
        >
          {items.length === 0 ? (
            <div
              className="px-4 py-6 text-[13px] text-center"
              style={{ color: "var(--color-muted)" }}
            >
              No results
            </div>
          ) : (
            grouped.map(([section, sectionItems]) => (
              <div key={section} className="pb-1">
                <div
                  className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-[0.18em] font-medium"
                  style={{ color: "var(--color-muted-soft)" }}
                >
                  {section}
                </div>
                <ul>
                  {sectionItems.map((item) => {
                    const index = flatIndex++;
                    const active = index === clampedIndex;
                    const Icon = item.icon;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          id={`cmdk-item-${item.id}`}
                          role="option"
                          aria-selected={active}
                          onMouseEnter={() => setSelectedIndex(index)}
                          onClick={() => item.run()}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-[13px]"
                          style={{
                            background: active
                              ? "var(--color-hover)"
                              : "transparent",
                            color: "var(--color-ink)",
                          }}
                        >
                          <Icon
                            size={15}
                            strokeWidth={1.75}
                            style={{
                              color: active
                                ? "var(--color-accent)"
                                : "var(--color-ink-soft)",
                            }}
                          />
                          <span className="flex-1 truncate">
                            {item.kind === "artifact" ? (
                              <span className="num">{item.label}</span>
                            ) : (
                              item.label
                            )}
                          </span>
                          {item.hint && (
                            <span
                              className="num text-[10px] uppercase tracking-[0.1em]"
                              style={{ color: "var(--color-muted-soft)" }}
                            >
                              {item.hint}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
