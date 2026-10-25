"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  isNavigationActive,
  PRIMARY_NAVIGATION_GROUPS,
} from "@/lib/navigation";

export function PrimaryNavigation({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const groups = PRIMARY_NAVIGATION_GROUPS.map((group) =>
    group.filter(([, , accountOnly]) => signedIn || !accountOnly),
  ).filter((group) => group.length > 0);
  return (
    <div className="nav-links" aria-label="Primary navigation">
      {groups.map((group, index) => (
        <div className="nav-group" key={index}>
          {group.map(([href, label]) => {
            const active = isNavigationActive(pathname, href);
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={active ? "active" : undefined}
                href={href}
                key={href}
              >
                {label}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}
