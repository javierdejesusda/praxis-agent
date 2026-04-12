type IconProps = {size?: number};

export function BtcIcon({size = 20}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="16" fill="#F7931A" />
      <path
        d="M22.5 14.1c.3-2-1.2-3.1-3.3-3.8l.7-2.7-1.7-.4-.7 2.6c-.4-.1-.9-.2-1.4-.3l.7-2.7-1.7-.4-.7 2.7c-.3-.1-.7-.2-1-.2l-2.3-.6-.4 1.8s1.2.3 1.2.3c.7.2.8.6.8 1l-.8 3.3c0 0 .1 0 .1 0l-.1 0-1.2 4.7c-.1.2-.3.6-.8.4 0 0-1.2-.3-1.2-.3l-.8 1.9 2.2.5c.4.1.8.2 1.2.3l-.7 2.8 1.7.4.7-2.7c.5.1.9.2 1.4.3l-.7 2.7 1.7.4.7-2.8c2.9.5 5.1.3 6-2.3.7-2.1 0-3.3-1.5-4.1 1.1-.3 1.9-1 2.1-2.5zm-3.8 5.3c-.5 2.1-4.1 1-5.2.7l.9-3.7c1.2.3 4.9.9 4.3 3zm.5-5.3c-.5 1.9-3.4.9-4.4.7l.8-3.4c1 .2 4.1.7 3.6 2.7z"
        fill="white"
      />
    </svg>
  );
}

export function EthIcon({size = 20}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="16" fill="#627EEA" />
      <path d="M16.5 4v8.9l7.5 3.3L16.5 4z" fill="white" fillOpacity="0.6" />
      <path d="M16.5 4L9 16.2l7.5-3.3V4z" fill="white" />
      <path d="M16.5 21.9v6.1l7.5-10.4-7.5 4.3z" fill="white" fillOpacity="0.6" />
      <path d="M16.5 28v-6.1L9 17.6l7.5 10.4z" fill="white" />
      <path d="M16.5 20.6l7.5-4.4-7.5-3.3v7.7z" fill="white" fillOpacity="0.2" />
      <path d="M9 16.2l7.5 4.4v-7.7L9 16.2z" fill="white" fillOpacity="0.6" />
    </svg>
  );
}

function GlyphIcon({
  size,
  bg,
  fg,
  glyph,
  fontSize,
}: {
  size: number;
  bg: string;
  fg: string;
  glyph: string;
  fontSize?: number;
}) {
  const fs = fontSize ?? Math.round(size * 0.55);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="16" fill={bg} />
      <text
        x="16"
        y="16"
        textAnchor="middle"
        dominantBaseline="central"
        fill={fg}
        fontFamily="ui-monospace, SFMono-Regular, monospace"
        fontWeight="700"
        fontSize={fs}
        style={{letterSpacing: "-0.02em"}}
      >
        {glyph}
      </text>
    </svg>
  );
}

export function SolIcon({size = 20}: IconProps) {
  return <GlyphIcon size={size} bg="#9945FF" fg="#FFFFFF" glyph="S" />;
}

export function UsdIcon({size = 20}: IconProps) {
  return <GlyphIcon size={size} bg="#22C55E" fg="#FFFFFF" glyph="$" />;
}

export function UsdcIcon({size = 20}: IconProps) {
  return <GlyphIcon size={size} bg="#2775CA" fg="#FFFFFF" glyph="$" />;
}

export function UsdtIcon({size = 20}: IconProps) {
  return <GlyphIcon size={size} bg="#26A17B" fg="#FFFFFF" glyph="$" />;
}

export function XrpIcon({size = 20}: IconProps) {
  return <GlyphIcon size={size} bg="#000000" fg="#FFFFFF" glyph="X" />;
}

export function AdaIcon({size = 20}: IconProps) {
  return <GlyphIcon size={size} bg="#0033AD" fg="#FFFFFF" glyph="A" />;
}

function UnknownIcon({size, symbol}: {size: number; symbol: string}) {
  const label = symbol.slice(0, 3).toUpperCase();
  const fs = Math.max(7, Math.round(size * 0.38));
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle
        cx="16"
        cy="16"
        r="15"
        fill="var(--color-surface)"
        stroke="var(--color-rule)"
        strokeWidth="1"
      />
      <text
        x="16"
        y="16"
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--color-ink-soft)"
        fontFamily="ui-monospace, SFMono-Regular, monospace"
        fontWeight="600"
        fontSize={fs}
      >
        {label}
      </text>
    </svg>
  );
}

function normalize(symbol: string): string {
  let s = symbol.toUpperCase().trim();
  if (s.startsWith("X") && s.length === 4 && s !== "XRP") s = s.slice(1);
  if (s.endsWith("USD") && s.length > 3) return s.slice(0, -3);
  if (s.endsWith("USDC") && s.length > 4) return s.slice(0, -4);
  if (s.endsWith("USDT") && s.length > 4) return s.slice(0, -4);
  return s;
}

export function CryptoIcon({
  symbol,
  size = 20,
}: {
  symbol: string;
  size?: number;
}) {
  const base = normalize(symbol);
  switch (base) {
    case "BTC":
    case "XBT":
      return <BtcIcon size={size} />;
    case "ETH":
      return <EthIcon size={size} />;
    case "SOL":
      return <SolIcon size={size} />;
    case "USD":
      return <UsdIcon size={size} />;
    case "USDC":
      return <UsdcIcon size={size} />;
    case "USDT":
      return <UsdtIcon size={size} />;
    case "XRP":
      return <XrpIcon size={size} />;
    case "ADA":
      return <AdaIcon size={size} />;
    default:
      return <UnknownIcon size={size} symbol={base || symbol} />;
  }
}
