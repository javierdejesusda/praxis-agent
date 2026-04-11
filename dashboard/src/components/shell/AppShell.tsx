"use client";

import { LeftRail } from "./LeftRail";
import { TopBar } from "./TopBar";
import { ApiHealthBanner } from "./ApiHealthBanner";
import { PageTransition } from "./PageTransition";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[color:var(--color-paper)]">
      <ApiHealthBanner />
      <TopBar />
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
