import Link from "next/link";
import {
  getPlayerSettings,
  listCurrentWorldState,
  listPlayerTodos,
  listStarChartNodes,
} from "@ordis-prime/db";
import { deriveNodeAccessStatus } from "@ordis-prime/domain";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import { buildPlanetMap } from "@/lib/planet-map";
import {
  loadStarChartLayout,
  type StarChartLayout,
} from "@/lib/star-chart-layout";
import { starChartHref } from "@/lib/star-chart-url";
import {
  isStarChartScope,
  STAR_CHART_SCOPES,
  starChartScope,
  type StarChartScope,
} from "@/lib/star-chart-scope";
import { updateVisibleNodeCompletions } from "./actions";

export const dynamic = "force-dynamic";

const DETAIL_OPTIONS = [
  ["events", "Live events"],
  ["todos", "Foundry tasks"],
  ["needed", "Unowned rewards"],
  ["mission", "Mission and faction"],
  ["levels", "Enemy levels"],
  ["rewards", "Reward counts"],
  ["access", "Access state"],
  ["completion", "Completion state"],
] as const;
type DetailOption = (typeof DETAIL_OPTIONS)[number][0];
const DEFAULT_DETAILS = new Set<DetailOption>([
  "events",
  "todos",
  "needed",
  "mission",
  "levels",
]);

type StarNode = ReturnType<typeof listStarChartNodes>[number] & {
  accessStatus: string;
};

export default async function StarChartPage({
  searchParams,
}: {
  searchParams: Promise<{
    planet?: string;
    scope?: string;
    show?: string | string[];
  }>;
}) {
  const [
    { planet: requestedPlanet, scope: requestedScope, show },
    session,
    layout,
  ] = await Promise.all([
    searchParams,
    getCurrentSession(),
    loadStarChartLayout(),
  ]);
  const database = getDatabase();
  const currentWindows = listCurrentWorldState(database);
  const eventNodeSlugs = new Set(
    currentWindows.flatMap((window) => (window.node ? [window.node.slug] : [])),
  );
  const todoNodeSlugs = new Set(
    session
      ? listPlayerTodos(database, session.user.id).flatMap((todo) =>
          todo.status === "open" && todo.entity?.kind === "node"
            ? [todo.entity.slug]
            : [],
        )
      : [],
  );
  const playerSettings = session
    ? getPlayerSettings(database, session.user.id)
    : undefined;
  const allNodes: StarNode[] = listStarChartNodes(
    database,
    session?.user.id,
  ).map((node) => ({
    ...node,
    accessStatus: deriveNodeAccessStatus({
      requirementStates: node.accessRequirements.map(
        ({ progressState }) => progressState,
      ),
      masteryRequirement: node.masteryRequirement,
      playerRank: playerSettings?.masteryRank,
      railjackIntrinsicRequirement: node.railjackIntrinsicRequirement,
      playerRailjackIntrinsicRank: playerSettings?.railjackIntrinsicRank,
      warframeRankRequirement: node.warframeRankRequirement,
      playerHighestWarframeRank: playerSettings?.highestWarframeRank,
      itemRequirementStates: node.itemRequirements.map(({ state }) => state),
      objectiveStates: node.objectives.map(
        ({ completionState }) => completionState,
      ),
      activeAdversaryRequirement: node.activeAdversaryRequirement,
      playerActiveAdversary: playerSettings?.activeAdversary,
    }),
  }));
  const nodesBySlug = new Map(allNodes.map((node) => [node.slug, node]));
  const planets = new Map<string, StarNode[]>();
  for (const node of allNodes) {
    const planet = node.planet ?? "Unmapped";
    planets.set(planet, [...(planets.get(planet) ?? []), node]);
  }
  const allPlanetNames = [...planets.keys()].sort((left, right) =>
    left.localeCompare(right),
  );
  const selectedPlanet = requestedPlanet
    ? allPlanetNames.find(
        (candidate) =>
          candidate.toLocaleLowerCase("en") ===
          requestedPlanet.toLocaleLowerCase("en"),
      )
    : undefined;
  const selectedScope: StarChartScope = selectedPlanet
    ? starChartScope(selectedPlanet)
    : isStarChartScope(requestedScope)
      ? requestedScope
      : "origin";
  const planetNames = allPlanetNames.filter(
    (planet) => starChartScope(planet) === selectedScope,
  );
  const selectedDetails = parseDetails(show);

  return (
    <>
      <p className="eyebrow">
        {selectedPlanet ? `${selectedPlanet} · ` : "Star Chart · "}
        Public sourced map · private progress overlay
      </p>
      <p className="lede">
        {selectedPlanet
          ? "Inspect mission routes, rewards, access requirements, and your selected private overlays."
          : "Choose a region, then open a location to inspect its mission nodes and sourced connections."}
      </p>
      <nav className="view-tabs" aria-label="Star Chart region">
        {STAR_CHART_SCOPES.map(([scope, label]) => {
          const count = allPlanetNames.filter(
            (planet) => starChartScope(planet) === scope,
          ).length;
          return (
            <Link
              aria-current={selectedScope === scope ? "page" : undefined}
              className={selectedScope === scope ? "active" : undefined}
              href={starChartHref({ scope })}
              key={scope}
            >
              {label} <span>{count}</span>
            </Link>
          );
        })}
      </nav>
      {requestedPlanet && !selectedPlanet && (
        <p className="notice">
          That celestial body is not in the active catalog. Showing the system
          overview instead.
        </p>
      )}
      {selectedPlanet ? (
        <PlanetView
          details={selectedDetails}
          eventNodeSlugs={eventNodeSlugs}
          layout={layout?.planets?.[selectedPlanet]}
          nodes={planets.get(selectedPlanet)!}
          nodesBySlug={nodesBySlug}
          planet={selectedPlanet}
          scope={selectedScope}
          session={Boolean(session)}
          todoNodeSlugs={todoNodeSlugs}
        />
      ) : (
        <SystemOverview
          eventNodeSlugs={eventNodeSlugs}
          layout={layout?.overview}
          nodesBySlug={nodesBySlug}
          planetNames={planetNames}
          planets={planets}
          todoNodeSlugs={todoNodeSlugs}
        />
      )}
    </>
  );
}

function SystemOverview({
  eventNodeSlugs,
  layout,
  nodesBySlug,
  planetNames,
  planets,
  todoNodeSlugs,
}: {
  eventNodeSlugs: Set<string>;
  layout: StarChartLayout["overview"];
  nodesBySlug: Map<string, StarNode>;
  planetNames: string[];
  planets: Map<string, StarNode[]>;
  todoNodeSlugs: Set<string>;
}) {
  const scope = planetNames[0] ? starChartScope(planetNames[0]) : "origin";
  const positions = systemPositions(planetNames, layout?.planets);
  const edges = systemEdges(planets, nodesBySlug, layout?.arcs);
  return (
    <>
      <div className="star-chart-toolbar">
        <p className="muted">
          Location summaries include live activity, open Foundry tasks, and
          unowned rewards where player data is available.
        </p>
        <Link className="nav-button" href="/star-chart/layout">
          Trace a screenshot layout
        </Link>
      </div>
      <section className="system-overview-card">
        <svg
          aria-label="Zoomed-out Origin System"
          className="system-overview-map"
          role="img"
          viewBox="0 0 1200 760"
        >
          <title>Origin System planet overview</title>
          {edges.map((edge) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) return null;
            return (
              <path
                className="system-route"
                d={routePath(from, to, edge.controls)}
                key={`${edge.from}:${edge.to}`}
              />
            );
          })}
          {planetNames.map((planet) => {
            const position = positions.get(planet)!;
            const nodes = planets.get(planet)!;
            const events = nodes.filter((node) =>
              eventNodeSlugs.has(node.slug),
            ).length;
            const todos = nodes.filter((node) =>
              todoNodeSlugs.has(node.slug),
            ).length;
            const needed = nodes.reduce(
              (total, node) =>
                total +
                (node.neededRewardCount ?? 0) +
                (node.neededOneTimeRewardCount ?? 0),
              0,
            );
            return (
              <a
                aria-label={`Zoom into ${planet}`}
                href={starChartHref({ planet, scope })}
                key={planet}
              >
                <circle
                  className="system-planet"
                  cx={position.x}
                  cy={position.y}
                  r={position.radius}
                />
                <text
                  className="system-planet-name"
                  textAnchor="middle"
                  x={position.x}
                  y={position.y + 4}
                >
                  {shortLabel(planet, 18)}
                </text>
                <text
                  className="system-planet-summary"
                  textAnchor="middle"
                  x={position.x}
                  y={position.y + position.radius + 18}
                >
                  {nodes.length} nodes
                  {events ? ` · ${events} live` : ""}
                  {todos ? ` · ${todos} tasks` : ""}
                  {needed ? ` · ${needed} needed` : ""}
                </text>
              </a>
            );
          })}
        </svg>
      </section>
      <section className="grid planet-summary-grid preference-collection">
        {planetNames.map((planet) => {
          const nodes = planets.get(planet)!;
          const connectedPlanets = new Set(
            nodes.flatMap((node) =>
              node.connections.flatMap((connection) => {
                const destination = nodesBySlug.get(connection.slug)?.planet;
                return destination && destination !== planet
                  ? [destination]
                  : [];
              }),
            ),
          );
          return (
            <Link
              className="card planet-summary-card preference-card"
              href={starChartHref({ planet, scope })}
              key={planet}
            >
              <span className="tag">{nodes.length} nodes</span>
              <h2>{planet}</h2>
              <p className="muted">
                {[...new Set(nodes.flatMap((node) => node.faction ?? []))]
                  .sort()
                  .join(" · ") || "Faction data unavailable"}
              </p>
              <p>
                {nodes.reduce((total, node) => total + node.rewardCount, 0)}{" "}
                repeatable rewards
                {connectedPlanets.size
                  ? ` · routes to ${[...connectedPlanets].sort().join(", ")}`
                  : ""}
              </p>
            </Link>
          );
        })}
      </section>
    </>
  );
}

function PlanetView({
  details,
  eventNodeSlugs,
  layout,
  nodes,
  nodesBySlug,
  planet,
  scope,
  session,
  todoNodeSlugs,
}: {
  details: Set<DetailOption>;
  eventNodeSlugs: Set<string>;
  layout?: {
    nodes: Record<string, { x: number; y: number; radius?: number }>;
    junctions?: Record<string, { x: number; y: number; radius?: number }>;
    edges?: Array<{
      from: string;
      to: string;
      controls?: Array<{ x: number; y: number }>;
    }>;
  };
  nodes: StarNode[];
  nodesBySlug: Map<string, StarNode>;
  planet: string;
  scope: StarChartScope;
  session: boolean;
  todoNodeSlugs: Set<string>;
}) {
  const map = applyPlanetLayout(buildPlanetMap(nodes), layout?.nodes);
  const junctions = planetJunctions(planet, nodes, nodesBySlug);
  return (
    <>
      <div className="star-chart-toolbar">
        <Link className="nav-button" href={starChartHref({ scope })}>
          ← {STAR_CHART_SCOPES.find(([key]) => key === scope)?.[1]}
        </Link>
        <Link className="nav-button" href="/star-chart/layout">
          Trace this planet
        </Link>
      </div>
      <form className="card star-chart-detail-controls">
        <input name="planet" type="hidden" value={planet} />
        {scope !== "origin" && (
          <input name="scope" type="hidden" value={scope} />
        )}
        <fieldset>
          <legend>Details shown</legend>
          <div className="filters">
            {DETAIL_OPTIONS.map(([value, label]) => (
              <label className="check-label" key={value}>
                <input
                  defaultChecked={details.has(value)}
                  name="show"
                  type="checkbox"
                  value={value}
                />{" "}
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <button className="button">Update detail</button>
      </form>
      <section className="planet-map planet-map-zoomed">
        <svg
          aria-label={`${planet} mission graph`}
          role="img"
          viewBox={`0 0 ${map.width} ${map.height}`}
        >
          <title>{planet} mission graph</title>
          <circle
            className="planet-orb"
            cx={map.centerX}
            cy={map.centerY}
            r="72"
          />
          <text
            className="planet-label"
            textAnchor="middle"
            x={map.centerX}
            y={map.centerY + 5}
          >
            {planet}
          </text>
          {map.edges.map((edge) => {
            const from = map.nodes.find(({ slug }) => slug === edge.fromSlug)!;
            const to = map.nodes.find(({ slug }) => slug === edge.toSlug)!;
            return (
              <line
                className="planet-route"
                key={`${edge.fromSlug}:${edge.toSlug}`}
                x1={from.x}
                x2={to.x}
                y1={from.y}
                y2={to.y}
              />
            );
          })}
          {layout?.edges?.map((edge, index) => {
            const from = map.nodes.find(({ slug }) => slug === edge.from);
            const to = map.nodes.find(({ slug }) => slug === edge.to);
            if (!from || !to) return null;
            return (
              <path
                className="planet-route"
                d={routePath(
                  from,
                  to,
                  edge.controls?.map((point) => ({
                    x: point.x * map.width,
                    y: point.y * map.height,
                  })),
                )}
                fill="none"
                key={`${edge.from}:${edge.to}:${index}`}
              />
            );
          })}
          {map.nodes.map((mapNode) => {
            const node = nodesBySlug.get(mapNode.slug)!;
            const classes = [
              "planet-node",
              details.has("events") && eventNodeSlugs.has(node.slug)
                ? "has-event"
                : "",
              details.has("todos") && todoNodeSlugs.has(node.slug)
                ? "has-todo"
                : "",
              details.has("needed") && (node.neededRewardCount ?? 0) > 0
                ? "has-needed"
                : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <a href={`/nodes/${node.slug}`} key={node.slug}>
                <circle
                  className={classes}
                  cx={mapNode.x}
                  cy={mapNode.y}
                  r={mapNode.radius ? mapNode.radius * map.width : 10}
                />
                <text
                  className="planet-node-label"
                  textAnchor="middle"
                  x={mapNode.x}
                  y={
                    mapNode.y +
                    (mapNode.radius ? mapNode.radius * map.width : 10) +
                    14
                  }
                >
                  {shortLabel(node.name, 22)}
                </text>
              </a>
            );
          })}
          {Object.entries(layout?.junctions ?? {}).map(([label, point]) => (
            <g key={label}>
              <rect
                className="planet-junction"
                height={(point.radius ?? 0.017) * map.width * 2}
                transform={`rotate(45 ${point.x * map.width} ${point.y * map.height})`}
                width={(point.radius ?? 0.017) * map.width * 2}
                x={point.x * map.width - (point.radius ?? 0.017) * map.width}
                y={point.y * map.height - (point.radius ?? 0.017) * map.width}
              />
              <text
                className="planet-node-label"
                textAnchor="middle"
                x={point.x * map.width}
                y={
                  point.y * map.height +
                  (point.radius ?? 0.017) * map.width +
                  14
                }
              >
                {shortLabel(label.replaceAll("-", " "), 22)}
              </text>
            </g>
          ))}
        </svg>
      </section>
      <p className="map-legend muted">
        {details.has("events") && (
          <>
            <span className="map-key event" /> live event or fissure
          </>
        )}
        {details.has("todos") && (
          <>
            <span className="map-key todo" /> open Foundry task
          </>
        )}
        {details.has("needed") && (
          <>
            <span className="map-key needed" /> unowned reward
          </>
        )}
      </p>
      {junctions.length > 0 && (
        <section className="card">
          <h2>Interplanetary routes</h2>
          <div className="filters">
            {junctions.map((junction) => (
              <Link
                className="tag"
                href={starChartHref({
                  planet: junction.planet,
                  show: [...details],
                })}
                key={`${junction.node}:${junction.planet}`}
              >
                {junction.node} → {junction.planet}
              </Link>
            ))}
          </div>
        </section>
      )}
      {session && nodes.length > 0 && (
        <form
          action={updateVisibleNodeCompletions}
          className="card star-chart-bulk"
          id="star-chart-completion"
        >
          <div>
            <h2>Edit {planet} completion</h2>
            <p className="muted">
              Check completed nodes below, then save this planet.
            </p>
          </div>
          <button className="button">Save completion</button>
        </form>
      )}
      <section className="node-grid preference-collection">
        {nodes.map((node) => (
          <article className="star-node preference-card" key={node.slug}>
            {session && (
              <input
                form="star-chart-completion"
                name="node"
                type="hidden"
                value={node.slug}
              />
            )}
            <h3>
              <Link href={`/nodes/${node.slug}`}>{node.name}</Link>
            </h3>
            {details.has("mission") && (
              <span>
                {[node.missionType, node.faction].filter(Boolean).join(" · ") ||
                  "Mission details unavailable"}
              </span>
            )}
            {details.has("levels") && node.minimumEnemyLevel !== undefined && (
              <span>
                Level {node.minimumEnemyLevel}–
                {node.maximumEnemyLevel ?? node.minimumEnemyLevel}
              </span>
            )}
            {details.has("rewards") && (
              <span>
                {node.rewardCount} repeatable · {node.oneTimeRewardCount}{" "}
                one-time rewards
              </span>
            )}
            {details.has("needed") && node.neededRewardCount !== undefined && (
              <span>
                {(node.neededRewardCount ?? 0) +
                  (node.neededOneTimeRewardCount ?? 0)}{" "}
                unowned rewards
              </span>
            )}
            {details.has("access") && (
              <span className={`tag access-${node.accessStatus}`}>
                {node.accessStatus}
              </span>
            )}
            {details.has("completion") && node.completionState && (
              <span className={`tag progress-${node.completionState}`}>
                {node.completionState}
              </span>
            )}
            {session && details.has("completion") && node.completionState && (
              <label className="check-label node-completion-check">
                <input
                  defaultChecked={node.completionState === "completed"}
                  form="star-chart-completion"
                  name="completed"
                  type="checkbox"
                  value={node.slug}
                />{" "}
                Completed
              </label>
            )}
          </article>
        ))}
      </section>
    </>
  );
}

function parseDetails(value: string | string[] | undefined): Set<DetailOption> {
  if (value === undefined) return new Set(DEFAULT_DETAILS);
  const values = typeof value === "string" ? [value] : value;
  return new Set(
    values.filter((entry): entry is DetailOption =>
      DETAIL_OPTIONS.some(([candidate]) => candidate === entry),
    ),
  );
}

function systemPositions(
  planets: string[],
  annotated?: Record<string, { x: number; y: number; radius: number }>,
) {
  const result = new Map<string, { x: number; y: number; radius: number }>();
  planets.forEach((planet, index) => {
    const manual = annotated?.[planet];
    if (manual) {
      result.set(planet, {
        x: manual.x * 1200,
        y: manual.y * 760,
        radius: manual.radius * 1200,
      });
      return;
    }
    const angle =
      (Math.PI * 2 * index) / Math.max(planets.length, 1) - Math.PI / 2;
    const ring = index % 2 === 0 ? 260 : 330;
    result.set(planet, {
      x: 600 + Math.cos(angle) * ring,
      y: 380 + Math.sin(angle) * ring * 0.72,
      radius: 31,
    });
  });
  return result;
}

function systemEdges(
  planets: Map<string, StarNode[]>,
  nodesBySlug: Map<string, StarNode>,
  annotated: Array<{
    from: string;
    to: string;
    controls?: Array<{ x: number; y: number }>;
  }> = [],
) {
  const controls = new Map(
    annotated.map((edge) => [
      [edge.from, edge.to].sort().join(":"),
      edge.controls?.map((point) => ({
        x: point.x * 1200,
        y: point.y * 760,
      })),
    ]),
  );
  const result = new Map<
    string,
    {
      from: string;
      to: string;
      controls?: Array<{ x: number; y: number }>;
    }
  >();
  for (const [planet, nodes] of planets)
    for (const node of nodes)
      for (const connection of node.connections) {
        const destination = nodesBySlug.get(connection.slug)?.planet;
        if (!destination || destination === planet) continue;
        const [from, to] = [planet, destination].sort() as [string, string];
        const key = `${from}:${to}`;
        result.set(key, { from, to, controls: controls.get(key) });
      }
  for (const edge of annotated) {
    const [from, to] = [edge.from, edge.to].sort() as [string, string];
    const key = `${from}:${to}`;
    if (!result.has(key))
      result.set(key, { from, to, controls: controls.get(key) });
  }
  return [...result.values()];
}

function routePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  controls: Array<{ x: number; y: number }> = [],
): string {
  if (controls.length >= 2)
    return `M ${from.x} ${from.y} C ${controls[0]!.x} ${controls[0]!.y}, ${controls[1]!.x} ${controls[1]!.y}, ${to.x} ${to.y}`;
  if (controls.length === 1)
    return `M ${from.x} ${from.y} Q ${controls[0]!.x} ${controls[0]!.y}, ${to.x} ${to.y}`;
  return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
}

function applyPlanetLayout<T extends ReturnType<typeof buildPlanetMap>>(
  map: T,
  annotated?: Record<string, { x: number; y: number; radius?: number }>,
): T {
  if (!annotated) return map;
  return {
    ...map,
    nodes: map.nodes.map((node) => {
      const point = annotated[node.slug];
      return point
        ? {
            ...node,
            x: point.x * map.width,
            y: point.y * map.height,
            radius: point.radius,
          }
        : node;
    }),
  };
}

function planetJunctions(
  planet: string,
  nodes: StarNode[],
  nodesBySlug: Map<string, StarNode>,
) {
  const result = new Map<string, { node: string; planet: string }>();
  for (const node of nodes)
    for (const connection of node.connections) {
      const destination = nodesBySlug.get(connection.slug);
      if (!destination?.planet || destination.planet === planet) continue;
      result.set(`${node.slug}:${destination.planet}`, {
        node: node.name,
        planet: destination.planet,
      });
    }
  return [...result.values()].sort(
    (left, right) =>
      left.planet.localeCompare(right.planet) ||
      left.node.localeCompare(right.node),
  );
}

function shortLabel(name: string, length: number): string {
  return name.length > length ? `${name.slice(0, length - 1)}…` : name;
}
