export const AUTOMATIC_CATALOG_SOURCE_IDS = [
  "wfcd-items",
  "wfcd-drops",
  "warframe-wiki-weapons",
  "warframe-wiki-warframes",
  "warframe-wiki-missions",
  "warframe-wiki-abilities",
] as const;

export type AutomaticCatalogSourceId =
  (typeof AUTOMATIC_CATALOG_SOURCE_IDS)[number];
