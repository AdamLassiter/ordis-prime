export type NavigationEntry = readonly [
  href: string,
  label: string,
  accountOnly?: boolean,
];

export const PRIMARY_NAVIGATION_GROUPS: readonly (readonly NavigationEntry[])[] =
  [
    [
      ["/", "Codex"],
      ["/discovery", "Progression"],
      ["/star-chart", "Star Chart"],
      ["/world-state", "Cycles"],
      ["/todos", "Alerts", true],
    ],
    [
      ["/builds", "Arsenal", true],
      ["/rankings", "Tier Lists"],
      ["/index", "Market"],
    ],
    [
      ["/planner", "Planner", true],
      ["/inventory", "Inventory", true],
    ],
  ];

export function isNavigationActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
