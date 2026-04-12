"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  const id = window.setInterval(onChange, 10_000);
  return () => window.clearInterval(id);
}

function getNow(): number {
  return Date.now();
}

function getNowServer(): number {
  return 0;
}

export function useNowMs(): number {
  return useSyncExternalStore(subscribe, getNow, getNowServer);
}
