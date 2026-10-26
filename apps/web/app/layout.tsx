import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getPlayerPreferences } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { PrimaryNavigation } from "./primary-navigation";
import { SessionNavigation } from "./session-navigation";
import { interfacePreferenceClasses } from "@/lib/interface-preferences";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Ordis Prime",
    template: "%s // Ordis Prime",
  },
  description:
    "Your Orbiter console for Warframe collections, farms, builds and live cycles.",
  icons: {
    icon: [{ url: "/ordis-prime.svg", type: "image/svg+xml" }],
    shortcut: "/ordis-prime.svg",
  },
};
export default async function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth.api.getSession({ headers: await headers() });
  const preferences = session
    ? getPlayerPreferences(getDatabase(), session.user.id)
    : undefined;
  const preferenceClasses = interfacePreferenceClasses(preferences);
  return (
    <html lang="en">
      <body className={preferenceClasses}>
        <header className="orbiter-header">
          <nav>
            <Link className="nav-brand" href="/" aria-label="Ordis Prime home">
              <Image
                className="ordis-prime-mark"
                src="/ordis-prime.svg"
                alt=""
                width={35}
                height={44}
                priority
              />
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
