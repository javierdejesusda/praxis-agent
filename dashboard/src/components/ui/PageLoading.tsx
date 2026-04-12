import {Skeleton} from "@/components/ui/Skeleton";

type PageLoadingProps = {
  header?: boolean;
  cards?: number;
};

export default function PageLoading({
  header = true,
  cards = 6,
}: PageLoadingProps) {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      {header ? (
        <div className="space-y-3">
          <Skeleton width={120} height={12} />
          <Skeleton width={260} height={28} />
          <Skeleton width={380} height={12} />
        </div>
      ) : null}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({length: cards}).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl p-5"
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-rule)",
            }}
          >
            <Skeleton width="40%" height={12} />
            <div className="mt-3">
              <Skeleton width="70%" height={24} />
            </div>
            <div className="mt-3">
              <Skeleton width="100%" height={10} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
