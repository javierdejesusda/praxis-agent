"use client";

import { ApiHealthBanner } from "./ApiHealthBanner";
import { LeftRail } from "./LeftRail";
import { PageTransition } from "./PageTransition";
import { TickerTape } from "./TickerTape";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[color:var(--color-paper)]">
      <ApiHealthBanner />
      <TopBar />
      <TickerTape />
      <div className="flex flex-1 min-h-0">
        <LeftRail />
        <main className="flex-1 min-w-0 overflow-auto">
          <div className="px-8 py-7">
            <PageTransition>{children}</PageTransition>
          </div>
        </main>
      </div>
    </div>
  );
}
