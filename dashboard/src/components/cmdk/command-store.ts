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

export function setCommandOpen(next: boolean) {
  if (open === next) return;
  open = next;
  notify();
}

export function toggleCommand() {
  open = !open;
  notify();
}

export function useCommandOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
