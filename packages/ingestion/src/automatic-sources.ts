export const AUTOMATIC_CATALOG_SOURCE_IDS = [
  "wfcd-items",
  "wfcd-drops",
  "warframe-wiki-weapons",
  "warframe-wiki-warframes",
  "warframe-wiki-missions",
  "warframe-wiki-junctions",
  "warframe-wiki-abilities",
  "warframe-wiki-focus",
  "warframe-wiki-quests",
  "warframe-wiki-enemies",
  "warframe-wiki-vendors",
] as const;

export type AutomaticCatalogSourceId =
  (typeof AUTOMATIC_CATALOG_SOURCE_IDS)[number];
