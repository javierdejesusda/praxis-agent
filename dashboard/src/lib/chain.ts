export const SEPOLIA_EXPLORER = "https://sepolia.etherscan.io";

export function etherscanTx(hash: string): string {
  return `${SEPOLIA_EXPLORER}/tx/${hash}`;
}

export function etherscanAddress(addr: string): string {
  return `${SEPOLIA_EXPLORER}/address/${addr}`;
}

export function shortHash(hash: string, lead = 6, tail = 4): string {
  if (!hash || hash.length <= lead + tail + 1) return hash ?? "";
  return `${hash.slice(0, lead)}…${hash.slice(-tail)}`;
}
