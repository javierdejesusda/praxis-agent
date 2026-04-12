"use client";

import { useSyncExternalStore } from "react";

let open = false;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getSnapshot(): boolean {
  return open;
}

function getServerSnapshot(): boolean {
  return false;
}

export function setMobileNavOpen(next: boolean) {
  if (open === next) return;
  open = next;
  notify();
}

export function toggleMobileNav() {
  setMobileNavOpen(!open);
}

export function useMobileNavOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
