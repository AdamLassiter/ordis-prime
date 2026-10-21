import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { SignOutButton } from "./sign-out-button";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Ordis Prime",
    template: "%s // Ordis Prime",
  },
  description:
    "Your Orbiter console for Warframe collections, farms, builds and live cycles.",
};
export default async function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth.api.getSession({ headers: await headers() });
  return (
    <html lang="en">
      <body>
        <header className="orbiter-header">
          <nav>
            <Link className="nav-brand" href="/" aria-label="Ordis Prime home">
              <span className="cephalon-mark" aria-hidden="true">
                <span />
              </span>
              <span className="brand-copy">
                <strong>ORDIS // PRIME</strong>
                <small>Orbiter intelligence</small>
              </span>
            </Link>
            <div className="nav-links" aria-label="Primary navigation">
              <Link href="/">Codex</Link>
              <Link href="/discovery">Atlas</Link>
              <Link href="/star-chart">Star chart</Link>
              <Link href="/world-state">Cycles</Link>
              <Link href="/rankings">Consensus</Link>
              {session && <Link href="/planner">Foundry plan</Link>}
              {session && <Link href="/todos">Directives</Link>}
              {session && <Link href="/builds">Arsenal</Link>}
              {session && <Link href="/inventory">Manifest</Link>}
              <Link href="/data-sources">Provenance</Link>
            </div>
            <div className="nav-session">
              {session?.user.role === "admin" && (
                <Link href="/admin/accounts">Crew</Link>
              )}
              {session ? (
                <>
                  <Link href="/account" title={session.user.name}>
                    Operator
                  </Link>
                  <SignOutButton />
                </>
              ) : (
                <Link className="nav-connect" href="/sign-in">
                  Connect
                </Link>
              )}
            </div>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
