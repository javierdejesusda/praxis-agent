import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agents \u00b7 Praxis",
  description: "6 specialist signal agents, LLM analyst, and risk governor.",
};

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
