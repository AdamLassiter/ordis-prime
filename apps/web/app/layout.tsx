import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { PrimaryNavigation } from "./primary-navigation";
import { SessionNavigation } from "./session-navigation";
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
            <PrimaryNavigation signedIn={Boolean(session)} />
            <SessionNavigation
              name={session?.user.name}
              role={session?.user.role}
              signedIn={Boolean(session)}
            />
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
