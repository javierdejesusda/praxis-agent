"use client";

import { useRegime } from "@/lib/hooks";
import { HairlineCard } from "@/components/ui/HairlineCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { KeyValueGrid } from "@/components/ui/KeyValueGrid";
import { NumericValue } from "@/components/ui/NumericValue";
import { StatusPill } from "@/components/ui/StatusPill";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";

export function RegimeCard() {
  const { data, isLoading } = useRegime();

  if (isLoading) {
    return (
      <HairlineCard>
        <SectionHeader
          title="Market Regime"
          isLoading
          rightSlot={<Skeleton width={68} height={18} radius={9} />}
        />
        <SkeletonText lines={4} widths={["60%", "45%", "55%", "50%"]} />
      </HairlineCard>
    );
  }

  const label = data?.regime?.toUpperCase() || "UNKNOWN";
  const regimeTone =
    label === "TRENDING" ? "ok" : label === "RANGING" ? "info" : "neutral";
  return (
    <HairlineCard>
      <SectionHeader
        title="Market Regime"
        updatedAt={data?.timestamp ?? null}
        rightSlot={<StatusPill tone={regimeTone} label={label} />}
      />
      <KeyValueGrid
        items={[
          { k: "Pair", v: data?.pair || "\u2014" },
          {
            k: "ADX",
            v: data?.adx ? (
              <NumericValue value={data.adx} kind="ratio" decimals={1} />
            ) : (
              "\u2014"
            ),
          },
          { k: "Trending \u2265", v: "25" },
          { k: "Ranging \u2264", v: "20" },
        ]}
      />
    </HairlineCard>
  );
}
