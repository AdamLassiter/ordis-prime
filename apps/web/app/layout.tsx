import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { SignOutButton } from "./sign-out-button";
import "./globals.css";
export const metadata: Metadata = { title: "Ordis Prime", description: "A source-aware Warframe acquisition companion" };
export default async function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth.api.getSession({ headers: await headers() });
  return <html lang="en"><body><header><nav><strong>ORDIS PRIME</strong><Link href="/">Explore</Link><Link href="/world-state">Timers</Link><Link href="/rankings">Rankings</Link><Link href="/planner">Planner</Link>{session && <><Link href="/todos">Todos</Link><Link href="/builds">Builds</Link><Link href="/inventory">Inventory</Link></>}<Link href="/data-sources">Sources</Link>{session ? <><span className="nav-user">{session.user.name}</span><SignOutButton /></> : <Link href="/sign-in">Sign in</Link>}</nav></header><main>{children}</main></body></html>;
}
