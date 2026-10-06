import "./globals.css";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { cn } from "@/lib/utils";

// Same fonts as agentmaxxin.xyz
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" });
const jetBrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });

export const metadata = {
  title: "GM Agent — an AI game master with its own treasury",
  description: "An autonomous AI game master that runs a daily puzzle game and manages its own USDC treasury on Base Sepolia, with x402 entry fees.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("dark font-sans antialiased", spaceGrotesk.variable, jetBrainsMono.variable)}>
      <body>{children}</body>
    </html>
  );
}
