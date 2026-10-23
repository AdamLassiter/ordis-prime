import fs from "node:fs/promises";
import path from "node:path";

export interface LayoutPoint {
  x: number;
  y: number;
}

export interface LayoutCircle extends LayoutPoint {
  radius: number;
}

export interface StarChartLayout {
  schemaVersion: 1;
  sourceImages?: Record<
    string,
    { name: string; width: number; height: number }
  >;
  overview?: {
    planets: Record<string, LayoutCircle>;
    arcs?: Array<{
      from: string;
      to: string;
      controls?: LayoutPoint[];
    }>;
  };
  planets?: Record<
    string,
    {
      nodes: Record<string, LayoutPoint>;
      junctions?: Record<string, LayoutPoint>;
    }
  >;
}

export async function loadStarChartLayout(): Promise<
  StarChartLayout | undefined
> {
  const filePath =
    process.env.ORDIS_STAR_CHART_LAYOUT ??
    path.resolve(process.cwd(), "../../data/manual/star-chart-layout.json");
  try {
    return parseStarChartLayout(
      await fs.readFile(/* turbopackIgnore: true */ filePath, "utf8"),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export function parseStarChartLayout(source: string): StarChartLayout {
  const value = JSON.parse(source) as unknown;
  if (!isRecord(value) || value.schemaVersion !== 1)
    throw new Error("Star-chart layout must use schemaVersion 1");
  const overview = value.overview;
  if (overview !== undefined) validateOverview(overview);
  const planets = value.planets;
  if (planets !== undefined) {
    if (!isRecord(planets)) throw new Error("Star-chart planets must be a map");
    for (const [planet, entry] of Object.entries(planets)) {
      if (!isRecord(entry) || !isRecord(entry.nodes))
        throw new Error(`Star-chart layout for ${planet} has no node map`);
      for (const [node, point] of Object.entries(entry.nodes))
        validatePoint(point, `${planet}.${node}`);
      if (entry.junctions !== undefined) {
        if (!isRecord(entry.junctions))
          throw new Error(`Star-chart junctions for ${planet} must be a map`);
        for (const [junction, point] of Object.entries(entry.junctions))
          validatePoint(point, `${planet}.${junction}`);
      }
    }
  }
  return value as unknown as StarChartLayout;
}

function validateOverview(value: unknown): void {
  if (!isRecord(value) || !isRecord(value.planets))
    throw new Error("Star-chart overview must contain a planet map");
  for (const [planet, circle] of Object.entries(value.planets)) {
    validatePoint(circle, `overview.${planet}`);
    if (
      !isRecord(circle) ||
      typeof circle.radius !== "number" ||
      circle.radius <= 0 ||
      circle.radius > 1
    )
      throw new Error(`Star-chart circle ${planet} has an invalid radius`);
  }
}

function validatePoint(value: unknown, label: string): void {
  if (
    !isRecord(value) ||
    typeof value.x !== "number" ||
    typeof value.y !== "number" ||
    value.x < 0 ||
    value.x > 1 ||
    value.y < 0 ||
    value.y > 1
  )
    throw new Error(`Star-chart point ${label} must be normalized to 0..1`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
