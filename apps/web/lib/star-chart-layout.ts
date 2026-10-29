import fs from "node:fs/promises";
import path from "node:path";

export interface LayoutPoint {
  x: number;
  y: number;
}

export interface LayoutCircle extends LayoutPoint {
  radius: number;
}

export interface LayoutSizedPoint extends LayoutPoint {
  radius?: number;
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
      nodes: Record<string, LayoutSizedPoint>;
      junctions?: Record<string, LayoutSizedPoint>;
      edges?: Array<{
        from: string;
        to: string;
        controls?: LayoutPoint[];
      }>;
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
  const sourceImages = value.sourceImages;
  if (sourceImages !== undefined) validateSourceImages(sourceImages);
  const planets = value.planets;
  if (planets !== undefined) {
    if (!isRecord(planets)) throw new Error("Star-chart planets must be a map");
    for (const [planet, entry] of Object.entries(planets)) {
      if (!isRecord(entry) || !isRecord(entry.nodes))
        throw new Error(`Star-chart layout for ${planet} has no node map`);
      for (const [node, point] of Object.entries(entry.nodes))
        validateSizedPoint(point, `${planet}.${node}`);
      if (entry.junctions !== undefined) {
        if (!isRecord(entry.junctions))
          throw new Error(`Star-chart junctions for ${planet} must be a map`);
        for (const [junction, point] of Object.entries(entry.junctions))
          validateSizedPoint(point, `${planet}.${junction}`);
      }
      if (entry.edges !== undefined) validateEdges(entry.edges, planet);
    }
  }
  return value as unknown as StarChartLayout;
}

function validateSourceImages(value: unknown): void {
  if (!isRecord(value))
    throw new Error("Star-chart source images must be a map");
  for (const [scope, image] of Object.entries(value)) {
    if (
      !isRecord(image) ||
      typeof image.name !== "string" ||
      !image.name ||
      typeof image.width !== "number" ||
      !Number.isInteger(image.width) ||
      image.width <= 0 ||
      typeof image.height !== "number" ||
      !Number.isInteger(image.height) ||
      image.height <= 0
    )
      throw new Error(`Star-chart source image ${scope} is invalid`);
  }
}

function validateEdges(value: unknown, scope: string): void {
  if (!Array.isArray(value))
    throw new Error(`Star-chart edges for ${scope} must be a list`);
  for (const [index, edge] of value.entries()) {
    if (
      !isRecord(edge) ||
      typeof edge.from !== "string" ||
      !edge.from ||
      typeof edge.to !== "string" ||
      !edge.to ||
      (edge.controls !== undefined && !Array.isArray(edge.controls))
    )
      throw new Error(`Star-chart edge ${scope}.${index} is invalid`);
    for (const [controlIndex, control] of (edge.controls ?? []).entries())
      validatePoint(control, `${scope}.edge.${index}.${controlIndex}`);
  }
}

function validateSizedPoint(value: unknown, label: string): void {
  validatePoint(value, label);
  if (
    isRecord(value) &&
    value.radius !== undefined &&
    (typeof value.radius !== "number" || value.radius <= 0 || value.radius > 1)
  )
    throw new Error(`Star-chart point ${label} has an invalid radius`);
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
