export interface TopologyNodeInput {
  slug: string;
  name: string;
  connections: Array<{ slug: string }>;
}

export interface PositionedTopologyNode {
  slug: string;
  name: string;
  x: number;
  y: number;
  focused: boolean;
}

export interface TopologyEdge {
  fromSlug: string;
  toSlug: string;
}

export interface StarChartNeighborhood {
  width: number;
  height: number;
  nodes: PositionedTopologyNode[];
  edges: TopologyEdge[];
}

const WIDTH = 640;
const HEIGHT = 400;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;
const RADIUS_X = 245;
const RADIUS_Y = 145;

export function buildStarChartNeighborhood(
  allNodes: readonly TopologyNodeInput[],
  focusSlug: string,
): StarChartNeighborhood | undefined {
  const bySlug = new Map(allNodes.map((node) => [node.slug, node]));
  const focused = bySlug.get(focusSlug);
  if (!focused) return undefined;

  const neighbors = focused.connections
    .flatMap(({ slug }) => {
      const node = bySlug.get(slug);
      return node ? [node] : [];
    })
    .sort((left, right) =>
      left.name.localeCompare(right.name, "en", { sensitivity: "base" }),
    );
  const positionedNeighbors = neighbors.map((node, index) => {
    const angle = (2 * Math.PI * index) / neighbors.length - Math.PI / 2;
    return {
      slug: node.slug,
      name: node.name,
      x: Math.round(CENTER_X + RADIUS_X * Math.cos(angle)),
      y: Math.round(CENTER_Y + RADIUS_Y * Math.sin(angle)),
      focused: false,
    };
  });

  return {
    width: WIDTH,
    height: HEIGHT,
    nodes: [
      {
        slug: focused.slug,
        name: focused.name,
        x: CENTER_X,
        y: CENTER_Y,
        focused: true,
      },
      ...positionedNeighbors,
    ],
    edges: positionedNeighbors.map((node) => ({
      fromSlug: focused.slug,
      toSlug: node.slug,
    })),
  };
}
