"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavigationActive } from "@/lib/navigation";
import { SignOutButton } from "./sign-out-button";

export function SessionNavigation({
  name,
  role,
  signedIn,
}: {
  name?: string;
  role?: string;
  signedIn: boolean;
}) {
  const pathname = usePathname();
  const provenanceActive = isNavigationActive(pathname, "/data-sources");

  if (!signedIn) {
    const active = isNavigationActive(pathname, "/sign-in");
    return (
      <div className="nav-session" aria-label="Account and operations">
        <Link
          aria-current={provenanceActive ? "page" : undefined}
          className={provenanceActive ? "active" : undefined}
          href="/data-sources"
        >
          Provenance
        </Link>
        <Link
          aria-current={active ? "page" : undefined}
          className="nav-connect"
          href="/sign-in"
        >
          Connect
        </Link>
      </div>
    );
  }

  const crewActive = isNavigationActive(pathname, "/admin");
  const operatorActive = isNavigationActive(pathname, "/account");

  return (
    <div className="nav-session" aria-label="Account and operations">
      <Link
        aria-current={provenanceActive ? "page" : undefined}
        className={provenanceActive ? "active" : undefined}
        href="/data-sources"
      >
        Provenance
      </Link>
      {role === "admin" && (
        <Link
          aria-current={crewActive ? "page" : undefined}
          className={crewActive ? "active" : undefined}
          href="/admin/accounts"
        >
          Crew
        </Link>
      )}
      <Link
        aria-current={operatorActive ? "page" : undefined}
        className={operatorActive ? "active" : undefined}
        href="/account"
        title={name}
      >
        Operator
      </Link>
      <SignOutButton />
    </div>
  );
}
