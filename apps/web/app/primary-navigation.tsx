"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavigationActive } from "@/lib/navigation";

const PUBLIC_LINKS = [
  ["/", "Codex"],
  ["/discovery", "Atlas"],
  ["/star-chart", "Star chart"],
  ["/world-state", "Cycles"],
  ["/rankings", "Consensus"],
  ["/index", "The Index"],
] as const;
const PRIVATE_LINKS = [
  ["/planner", "Foundry plan"],
  ["/todos", "Directives"],
  ["/builds", "Arsenal"],
  ["/inventory", "Manifest"],
] as const;

export function PrimaryNavigation({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const links = [
    ...PUBLIC_LINKS,
    ...(signedIn ? PRIVATE_LINKS : []),
    ["/data-sources", "Provenance"] as const,
  ];
  return (
    <div className="nav-links" aria-label="Primary navigation">
      {links.map(([href, label]) => {
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
  );
}
