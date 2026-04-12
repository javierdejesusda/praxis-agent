import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Backtest \u00b7 Praxis",
  description: "Historical performance, Sharpe, and cost/edge metrics.",
};

export default function BacktestLayout({ children }: { children: React.ReactNode }) {
  return children;
}
