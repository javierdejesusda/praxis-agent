"use client";

import { LeftRail } from "./LeftRail";
import { TopBar } from "./TopBar";
import { ApiHealthBanner } from "./ApiHealthBanner";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[color:var(--color-bone)]">
      <ApiHealthBanner />
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <LeftRail />
        <main className="flex-1 min-w-0 overflow-auto">
          <div className="px-6 py-5">{children}</div>
        </main>
      </div>
    </div>
  );
}
