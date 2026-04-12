import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Signals \u00b7 Praxis",
  description: "Latest agent scores, LLM rationale, and risk decision.",
};

export default function SignalsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
