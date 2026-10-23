import { listStarChartNodes } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { starChartScope } from "@/lib/star-chart-scope";

export const dynamic = "force-dynamic";

export async function GET() {
  const nodes = listStarChartNodes(getDatabase());
  const planets = new Map<string, Array<{ name: string; slug: string }>>();
  for (const node of nodes) {
    const planet = node.planet ?? "Unmapped";
    planets.set(planet, [
      ...(planets.get(planet) ?? []),
      { name: node.name, slug: node.slug },
    ]);
  }
  return Response.json({
    planets: [...planets]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, entries]) => ({
        name,
        scope: starChartScope(name),
        nodes: entries.sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
      })),
  });
}
