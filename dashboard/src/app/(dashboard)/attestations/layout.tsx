import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Attestations \u00b7 Praxis",
  description: "ERC-8004 on-chain attestation log and trends.",
};

export default function AttestationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
