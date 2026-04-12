// Hackathon-issued RiskRouter instance on Sepolia (11155111). These values
// are the canonical EIP-712 domain separator the agent signs TradeIntents
// under and are sourced from the shared CLAUDE.md contract manifest.
export const RISK_ROUTER_ADDRESS =
  "0xd6A6952545FF6E6E6681c2d15C59f9EB8F40FdBC";

export const RISK_ROUTER_DOMAIN = {
  name: "RiskRouter",
  version: "1",
  chainId: 11155111,
} as const;

export const ERC8004_ELIGIBLE_THRESHOLD = 85;
export const PAPER_THRESHOLD = 70;
