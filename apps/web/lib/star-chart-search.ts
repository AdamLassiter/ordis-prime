export interface SearchableStarChartNode {
  name: string;
  planet?: string;
  missionType?: string;
  faction?: string;
  discoveries: Array<{ name: string; kind: string }>;
}

export function matchesStarChartQuery(
  node: SearchableStarChartNode,
  query: string,
): boolean {
  const normalized = query.trim().toLocaleLowerCase("en");
  if (!normalized) return true;
  return [
    node.name,
    node.planet,
    node.missionType,
    node.faction,
    ...node.discoveries.flatMap(({ name, kind }) => [name, kind]),
  ].some((value) => value?.toLocaleLowerCase("en").includes(normalized));
}
