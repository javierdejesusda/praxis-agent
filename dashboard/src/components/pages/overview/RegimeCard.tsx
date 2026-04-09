"use client";

import { useRegime } from "@/lib/hooks";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { KeyValueGrid } from "@/components/ui/KeyValueGrid";
import { NumericValue } from "@/components/ui/NumericValue";
import { StatusPill } from "@/components/ui/StatusPill";

export function RegimeCard() {
  const { data } = useRegime();
  const label = data?.regime?.toUpperCase() || "UNKNOWN";
  return (
    <HairlineCard>
      <SectionHeader title="Market Regime" rightSlot={<StatusPill tone="neutral" label={label} />} />
      <KeyValueGrid
        items={[
          { k: "Pair", v: data?.pair || "—" },
          { k: "ADX", v: data?.adx ? <NumericValue value={data.adx} kind="ratio" decimals={1} /> : "—" },
          { k: "Trending ≥", v: "25" },
          { k: "Ranging ≤", v: "20" },
        ]}
      />
    </HairlineCard>
  );
}
