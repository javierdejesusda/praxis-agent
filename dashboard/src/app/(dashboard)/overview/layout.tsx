import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Overview \u00b7 Praxis",
  description: "Live positions, KPIs, and the latest decision walkthrough.",
};

export default function OverviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
