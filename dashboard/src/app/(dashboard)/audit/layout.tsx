import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Audit \u00b7 Praxis",
  description: "Canonical artifact log for every agent output.",
};

export default function AuditLayout({ children }: { children: React.ReactNode }) {
  return children;
}
