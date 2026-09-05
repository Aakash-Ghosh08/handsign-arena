import type { Metadata } from "next";
import { Shippori_Mincho_B1, Inter } from "next/font/google";
import "./globals.css";

const display = Shippori_Mincho_B1({
  subsets: ["latin"],
  weight: ["600", "800"],
  variable: "--font-display",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Handsign Arena — cast with your hands",
  description: "A fast 1v1 browser duel: perform hand signs on your webcam to cast fire, lightning, shields, and more against a remote opponent.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="font-body bg-ink text-paper min-h-screen antialiased">{children}</body>
    </html>
  );
}
