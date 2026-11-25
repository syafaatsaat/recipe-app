import type { Metadata } from "next";
import { DM_Mono, DM_Sans, Shippori_Mincho } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Doc §8: Shippori Mincho headings, DM Sans body, DM Mono amounts. All SIL OFL,
// self-hosted by next/font at build time.
const sans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const mono = DM_Mono({ variable: "--font-dm-mono", subsets: ["latin"], weight: ["400", "500"] });
const heading = Shippori_Mincho({ variable: "--font-shippori", subsets: ["latin"], weight: ["500", "600"] });

export const metadata: Metadata = {
  title: { default: "Recipes", template: "%s · Recipes" },
  description: "Save, scale and convert your recipes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${heading.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
