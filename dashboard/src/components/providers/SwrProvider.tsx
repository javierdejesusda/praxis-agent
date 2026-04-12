"use client";

import { SWRConfig } from "swr";

export function SwrProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        keepPreviousData: true,
        revalidateOnFocus: true,
        dedupingInterval: 2000,
        errorRetryCount: 4,
      }}
    >
      {children}
    </SWRConfig>
  );
}
