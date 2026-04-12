import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, IBM_Plex_Serif } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});
const plexSerif = IBM_Plex_Serif({
  variable: "--font-plex-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://praxis-agent.site"),
  title: "Praxis \u2014 Trading Operations",
  description: "Regime-adaptive trading agent with on-chain validation.",
  openGraph: {
    title: "Praxis \u2014 Trading Operations",
    description:
      "Regime-adaptive trading agent with ERC-8004 on-chain validation and dual execution.",
    url: "https://praxis-agent.site",
    siteName: "Praxis",
    type: "website",
    images: [
      {
        url: "/praxis-og.png",
        width: 1200,
        height: 630,
        alt: "Praxis Trading Operations",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Praxis \u2014 Trading Operations",
    description:
      "Regime-adaptive trading agent with ERC-8004 on-chain validation.",
    images: ["/praxis-og.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plexSans.variable} ${plexMono.variable} ${plexSerif.variable} antialiased`}
    >
      <body suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
          storageKey="praxis-theme"
        >
          {children}
          <Toaster
            position="top-right"
            richColors
            closeButton
            theme="system"
            toastOptions={{
              style: {
                fontFamily: "var(--font-plex-sans), system-ui, sans-serif",
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
