export interface PlanetMapInput {
  slug: string;
  name: string;
  connections: Array<{ slug: string }>;
}

export interface PlanetMapNode extends PlanetMapInput {
  x: number;
  y: number;
}

export function buildPlanetMap(nodes: PlanetMapInput[]) {
  const ordered = [...nodes].sort(
    (left, right) =>
      left.name.localeCompare(right.name) ||
      left.slug.localeCompare(right.slug),
  );
  const width = 420;
  const height = Math.max(260, Math.ceil(ordered.length / 14) * 90 + 220);
  const centerX = width / 2;
  const centerY = height / 2;
  const positioned: PlanetMapNode[] = ordered.map((node, index) => {
    const ring = Math.floor(index / 14);
    const ringEntries = Math.min(14, ordered.length - ring * 14);
    const angle = ((index % 14) / ringEntries) * Math.PI * 2 - Math.PI / 2;
    const radius = 92 + ring * 58;
    return {
      ...node,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
  });
  const slugs = new Set(positioned.map(({ slug }) => slug));
  const edges = positioned.flatMap((node) =>
    node.connections
      .filter(({ slug }) => slugs.has(slug) && node.slug < slug)
      .map(({ slug }) => ({ fromSlug: node.slug, toSlug: slug })),
  );
  return { width, height, centerX, centerY, nodes: positioned, edges };
}
