export interface DiscoveryTopologyInput {
  kind: string;
  slug: string;
  name: string;
  relations: ReadonlyArray<{
    subject: { kind: string; slug: string; name: string };
  }>;
}

export interface PositionedDiscoveryNode {
  key: string;
  kind: string;
  slug: string;
  name: string;
  x: number;
  y: number;
  focused: boolean;
}

export interface DiscoveryTopology {
  width: number;
  height: number;
  nodes: PositionedDiscoveryNode[];
  edges: Array<{ fromKey: string; toKey: string }>;
}

const WIDTH = 720;
const HEIGHT = 440;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;
const RADIUS_X = 275;
const RADIUS_Y = 160;

export function buildDiscoveryTopology(
  focused: DiscoveryTopologyInput,
): DiscoveryTopology {
  const focusKey = entityKey(focused.kind, focused.slug);
  const neighbors = new Map<
    string,
    DiscoveryTopologyInput["relations"][number]["subject"]
  >();
  for (const { subject } of focused.relations) {
    const key = entityKey(subject.kind, subject.slug);
    if (key !== focusKey) neighbors.set(key, subject);
  }
  const ordered = [...neighbors.entries()].sort(
    ([, left], [, right]) =>
      left.name.localeCompare(right.name, "en", { sensitivity: "base" }) ||
      left.kind.localeCompare(right.kind) ||
      left.slug.localeCompare(right.slug),
  );
  const positioned = ordered.map(([key, node], index) => {
    const angle = (2 * Math.PI * index) / ordered.length - Math.PI / 2;
    return {
      key,
      ...node,
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
        key: focusKey,
        kind: focused.kind,
        slug: focused.slug,
        name: focused.name,
        x: CENTER_X,
        y: CENTER_Y,
        focused: true,
      },
      ...positioned,
    ],
    edges: positioned.map(({ key }) => ({ fromKey: focusKey, toKey: key })),
  };
}

export function entityKey(kind: string, slug: string): string {
  return `${kind}:${slug}`;
}
