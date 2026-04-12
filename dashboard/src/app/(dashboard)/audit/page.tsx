"use client";

import dynamic from "next/dynamic";
import {useMemo, useState} from "react";

import {
  AuditFilterBar,
  EMPTY_AUDIT_FILTERS,
  type AuditFilters,
} from "@/components/audit/AuditFilterBar";
import {HairlineCard} from "@/components/ui/HairlineCard";
import {PageHeader} from "@/components/ui/PageHeader";
import {SectionHeader} from "@/components/ui/SectionHeader";
import {SkeletonChart} from "@/components/ui/Skeleton";
import {useArtifacts} from "@/lib/hooks";

const ArtifactsTable = dynamic(
  () =>
    import("@/components/audit/ArtifactsTable").then((m) => ({
      default: m.ArtifactsTable,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="p-5">
        <SkeletonChart height={260} />
      </div>
    ),
  },
);

export default function AuditPage() {
  const {data, isLoading} = useArtifacts(200);
  const artifacts = useMemo(() => data ?? [], [data]);
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_AUDIT_FILTERS);

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of artifacts) if (a.type) set.add(a.type);
    return Array.from(set).sort();
  }, [artifacts]);

  const pairOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of artifacts) {
      const pair = a.payload?.pair;
      if (pair) set.add(pair);
    }
    return Array.from(set).sort();
  }, [artifacts]);

  return (
    <>
      <PageHeader
        eyebrow="Provenance"
        title="Audit Log"
        description="Every artifact the agent emits is content-addressed and stored here. Search by hash, filter by type or pair, and expand any row for the full payload."
      />
      <HairlineCard padded={false}>
        <div className="px-5 pt-4">
          <SectionHeader title="Artifacts" count={artifacts.length} />
        </div>
        <AuditFilterBar
          value={filters}
          onChange={setFilters}
          typeOptions={typeOptions}
          pairOptions={pairOptions}
        />
        <ArtifactsTable
          artifacts={artifacts}
          isLoading={isLoading && artifacts.length === 0}
          filters={filters}
        />
      </HairlineCard>
    </>
  );
}
