"use client";

import {ExternalLink} from "lucide-react";

import {CopyButton} from "@/components/ui/CopyButton";
import {HairlineCard} from "@/components/ui/HairlineCard";
import {etherscanAddress, shortHash} from "@/lib/chain";

type ContractRow = {
  label: string;
  address: string;
  chip?: {text: string};
};

const CONTRACTS: ContractRow[] = [
  {
    label: "HackathonVault",
    address: "0x0E7CD8ef9743FEcf94f9103033a044caBD45fC90",
    chip: {text: "0.05 ETH allocation"},
  },
  {
    label: "Risk Router",
    address: "0xd6A6952545FF6E6E6681c2d15C59f9EB8F40FdBC",
  },
  {
    label: "Agent Registry",
    address: "0x97b07dDc405B0c28B17559aFFE63BdB3632d0ca3",
  },
  {
    label: "Reputation Registry",
    address: "0x423a9904e39537a9997fbaF0f220d79D7d545763",
  },
  {
    label: "Validation Registry",
    address: "0x92bF63E5C7Ac6980f237a7164Ab413BE226187F1",
  },
];

export function HackathonVaultBadge() {
  return (
    <HairlineCard>
      <section
        role="region"
        aria-label="Hackathon contract directory"
        className="flex flex-col gap-3.5"
      >
        <header className="flex items-center justify-between gap-3 pb-2.5 border-b border-[color:var(--color-rule)]">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-muted)]">
            Hackathon contracts · Sepolia
          </h3>
          <span
            className="num text-[10px] px-2 py-0.5 rounded-full border border-[color:var(--color-rule)] text-[color:var(--color-muted)]"
            style={{background: "var(--color-surface-solid)"}}
          >
            Sepolia 11155111
          </span>
        </header>

        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          {CONTRACTS.map((row, index) => {
            const isLastRow =
              index === CONTRACTS.length - 1 ||
              (CONTRACTS.length % 2 === 0 && index === CONTRACTS.length - 2);
            const isLastRowDesktop = index >= CONTRACTS.length - 2;
            return (
              <li
                key={row.address}
                className={`flex items-center justify-between gap-3 py-2.5 border-b border-[color:var(--color-rule)] ${
                  isLastRow ? "last:border-b-0" : ""
                } ${isLastRowDesktop ? "md:border-b-0" : ""}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[12px] font-semibold text-[color:var(--color-ink)] whitespace-nowrap">
                    {row.label}
                  </span>
                  {row.chip && (
                    <span
                      className="num text-[10px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap"
                      style={{
                        background: "var(--color-warn-soft)",
                        color: "var(--color-warn)",
                      }}
                    >
                      {row.chip.text}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <CopyButton
                    value={row.address}
                    label={shortHash(row.address, 6, 4)}
                    truncate={14}
                  />
                  <a
                    href={etherscanAddress(row.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`View ${row.label} on Etherscan`}
                    className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[color:var(--color-muted)] hover:text-[color:var(--color-ink)] hover:bg-[color:var(--color-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)] transition-colors"
                  >
                    <ExternalLink size={12} strokeWidth={2} />
                  </a>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="text-[11px] text-[color:var(--color-muted)] leading-relaxed">
          ERC-8004 attestation infrastructure. Shared across hackathon teams.
        </p>
      </section>
    </HairlineCard>
  );
}
