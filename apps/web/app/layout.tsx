import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
export const metadata: Metadata = { title: "Ordis Prime", description: "A source-aware Warframe acquisition companion" };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><header><nav><strong>ORDIS PRIME</strong><Link href="/">Explore</Link><Link href="/planner">Planner</Link><Link href="/data-sources">Sources</Link></nav></header><main>{children}</main></body></html>;
}
