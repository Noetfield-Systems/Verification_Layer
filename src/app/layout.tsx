import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Noetfield — Agent Execution Assurance",
  description:
    "Cryptographic proof that your AI agent's code is safe to deploy. Noetfield is the verification layer between AI generation and production infrastructure.",
  keywords: [
    "Noetfield",
    "AI agent verification",
    "deploy token",
    "SOC 2",
    "FINTRAC",
    "EU AI Act",
    "cryptographic receipt",
  ],
  authors: [{ name: "Noetfield Systems" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Noetfield — Agent Execution Assurance",
    description:
      "Cryptographic proof that your AI agent's code is safe to deploy.",
    siteName: "Noetfield",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Noetfield — Agent Execution Assurance",
    description:
      "Cryptographic proof that your AI agent's code is safe to deploy.",
  },
};

// Force dark mode at the document level — Noetfield ships dark-first.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
