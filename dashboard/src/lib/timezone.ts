"use client";

import { useSyncExternalStore } from "react";

export type TimezoneMode = "UTC" | "LOCAL";

const STORAGE_KEY = "praxis:timezone";

function readMode(): TimezoneMode {
  if (typeof window === "undefined") return "UTC";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === "LOCAL" ? "LOCAL" : "UTC";
}

const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setTimezoneMode(mode: TimezoneMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, mode);
  notify();
}

export function toggleTimezoneMode() {
  setTimezoneMode(readMode() === "UTC" ? "LOCAL" : "UTC");
}

export function useTimezoneMode(): TimezoneMode {
  return useSyncExternalStore(subscribe, readMode, () => "UTC");
}

const TIME_FMT_UTC = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const TIME_FMT_LOCAL = new Intl.DateTimeFormat("en-GB", {
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function formatTimestamp(
  iso: string | null | undefined,
  mode: TimezoneMode,
): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = (mode === "UTC" ? TIME_FMT_UTC : TIME_FMT_LOCAL)
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  const tz = mode === "UTC" ? " UTC" : "";
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}${tz}`;
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const s = Math.round(diff / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
