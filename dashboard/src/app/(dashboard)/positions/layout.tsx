import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Positions \u00b7 Praxis",
  description: "Open positions, trade history, and equity curve.",
};

export default function PositionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
