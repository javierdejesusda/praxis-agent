"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ArtifactsTable } from "@/components/pages/audit/ArtifactsTable";

export default function AuditPage() {
  return (
    <>
      <PageHeader
        eyebrow="Provenance"
        title="Audit Log"
        description="All artifacts emitted by the agent, searchable by hash."
      />
      <HairlineCard padded={false}>
        <div className="px-4 pt-3">
          <SectionHeader title="Artifacts" />
        </div>
        <ArtifactsTable />
      </HairlineCard>
    </>
  );
}
