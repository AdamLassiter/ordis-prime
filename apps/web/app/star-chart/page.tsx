import Link from "next/link";
import { getPlayerSettings, listStarChartNodes } from "@ordis-prime/db";
import {
  deriveNodeAccessStatus,
  type NodeAccessStatus,
} from "@ordis-prime/domain";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import { updateVisibleNodeCompletions } from "./actions";

export const dynamic = "force-dynamic";

export default async function StarChartPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    needed?: string;
    focus?: string;
    access?: string;
    completion?: string;
  }>;
}) {
  const session = await getCurrentSession();
  const { q = "", needed, focus, access, completion } = await searchParams;
  const normalized = q.trim().toLocaleLowerCase();
  const neededOnly = Boolean(session && needed === "1");
  const selectedAccess = isAccessStatus(access) ? access : undefined;
  const selectedCompletion =
    session && (completion === "completed" || completion === "incomplete")
      ? completion
      : undefined;
  const database = getDatabase();
  const playerSettings = session
    ? getPlayerSettings(database, session.user.id)
    : undefined;
  const allNodes = listStarChartNodes(database, session?.user.id).map(
    (node) => ({
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
        activeAdversaryRequirement: node.activeAdversaryRequirement,
        playerActiveAdversary: playerSettings?.activeAdversary,
      }),
    }),
  );
  const nodesBySlug = new Map(allNodes.map((node) => [node.slug, node]));
  const focusedNode = focus ? nodesBySlug.get(focus) : undefined;
  const nodes = allNodes.filter(
    (node) =>
      (!normalized ||
        [node.name, node.planet, node.missionType, node.faction].some((value) =>
          value?.toLocaleLowerCase().includes(normalized),
        )) &&
      (!neededOnly || (node.neededRewardCount ?? 0) > 0) &&
      (!selectedAccess || node.accessStatus === selectedAccess) &&
      (!selectedCompletion || node.completionState === selectedCompletion),
  );
  const planets = new Map<string, typeof nodes>();
  for (const node of nodes) {
    const planet = node.planet ?? "Unmapped";
    planets.set(planet, [...(planets.get(planet) ?? []), node]);
  }
  return (
    <>
      <p className="eyebrow">Spatial acquisition index</p>
      <h1>
        <u>Star chart</u>
      </h1>
      <p className="lede">
        Browse canonical mission nodes by planet and see where your collection
        still has gaps. The connection explorer follows the current cited Wiki
        graph; its topology is useful even though it does not claim the game's
        visual coordinates.
      </p>
      <form className="inline-form">
        <label>
          Filter
          <input
            name="q"
            defaultValue={q}
            placeholder="Planet, node, mission, faction…"
          />
        </label>
        {session && (
          <label>
            Completion
            <select name="completion" defaultValue={selectedCompletion ?? ""}>
              <option value="">Any completion state</option>
              <option value="incomplete">Incomplete</option>
              <option value="completed">Completed</option>
            </select>
          </label>
        )}
        {session && (
          <label className="check-label">
            <input
              name="needed"
              type="checkbox"
              value="1"
              defaultChecked={neededOnly}
            />{" "}
            Only nodes with unowned rewards
          </label>
        )}
        <label>
          Access
          <select name="access" defaultValue={selectedAccess ?? ""}>
            <option value="">Any access state</option>
            <option value="available">Available</option>
            <option value="conditional">Conditional</option>
            <option value="blocked">Blocked</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
        <button className="button">Apply</button>
      </form>
      {focus && !focusedNode && (
        <p className="notice">
          That focused node is not in the active catalog.
        </p>
      )}
      {focusedNode && (
        <section className="card connection-explorer">
          <p className="eyebrow">Connection explorer</p>
          <h2>{focusedNode.name}</h2>
          <p className="muted">
            {[focusedNode.planet, focusedNode.missionType, focusedNode.faction]
              .filter(Boolean)
              .join(" · ") || "Mission details unavailable"}
            {` · Access ${focusedNode.accessStatus}`}
            {focusedNode.completionState
              ? ` · ${focusedNode.completionState}`
              : ""}
          </p>
          <div className="filters">
            <Link className="button" href={`/nodes/${focusedNode.slug}`}>
              Open node and rewards
            </Link>
            <Link className="nav-button" href="/star-chart">
              Clear focus
            </Link>
          </div>
          <h3>Directly connected nodes</h3>
          {focusedNode.connections.length ? (
            <div className="connection-grid">
              {focusedNode.connections.map((connection) => {
                const neighbor = nodesBySlug.get(connection.slug);
                return (
                  <Link
                    className="connection-node"
                    href={focusHref(connection.slug)}
                    key={connection.slug}
                  >
                    <strong>{connection.name}</strong>
                    <span>
                      {[
                        connection.planet,
                        neighbor?.missionType,
                        neighbor?.faction,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Mission details unavailable"}
                    </span>
                    {neighbor && (
                      <span>
                        {neighbor.rewardCount} recorded rewards ·{" "}
                        {neighbor.connectionCount} connections
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="notice">
              No active cited navigation edges are recorded for this node.
            </p>
          )}
        </section>
      )}
      {session && nodes.length > 0 && (
        <form
          action={updateVisibleNodeCompletions}
          className="card star-chart-bulk"
          id="star-chart-completion"
        >
          <div>
            <h2>Edit visible node completion</h2>
            <p className="muted">
              Check every completed node below, then save. Only these{" "}
              {nodes.length} filtered{" "}
              {nodes.length === 1 ? "node is" : "nodes are"} changed; nodes
              hidden by the current filters keep their existing state.
            </p>
          </div>
          <button className="button">Save visible completion</button>
        </form>
      )}
      {[...planets.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([planet, planetNodes]) => (
          <section className="planet-group" key={planet}>
            <h2>{planet}</h2>
            <div className="node-grid">
              {planetNodes.map((node) => (
                <article className="star-node" key={node.slug}>
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
                  <span>
                    {[node.missionType, node.faction]
                      .filter(Boolean)
                      .join(" · ") || "Mission details unavailable"}
                  </span>
                  {node.minimumEnemyLevel !== undefined && (
                    <span>
                      Level {node.minimumEnemyLevel}–
                      {node.maximumEnemyLevel ?? node.minimumEnemyLevel}
                    </span>
                  )}
                  <span>
                    {node.rewardCount} recorded rewards
                    {node.neededRewardCount === undefined
                      ? ""
                      : ` · ${node.neededRewardCount} needed`}
                  </span>
                  <span>
                    {node.connectionCount} cited{" "}
                    {node.connectionCount === 1 ? "connection" : "connections"}
                  </span>
                  <span className={`tag access-${node.accessStatus}`}>
                    {node.accessStatus}
                  </span>
                  {node.completionState && (
                    <span className={`tag progress-${node.completionState}`}>
                      {node.completionState}
                    </span>
                  )}
                  {session && node.completionState && (
                    <label className="check-label node-completion-check">
                      <input
                        defaultChecked={node.completionState === "completed"}
                        form="star-chart-completion"
                        name="completed"
                        type="checkbox"
                        value={node.slug}
                      />
                      Completed
                    </label>
                  )}
                  {node.connectionCount > 0 && (
                    <Link
                      className="star-node-explore"
                      href={focusHref(node.slug)}
                    >
                      Explore connections →
                    </Link>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      {!nodes.length && <p className="notice">No nodes match these filters.</p>}
    </>
  );
}

function focusHref(slug: string): string {
  return `/star-chart?${new URLSearchParams({ focus: slug })}`;
}

function isAccessStatus(value: string | undefined): value is NodeAccessStatus {
  return ["available", "conditional", "blocked", "unknown"].includes(
    value ?? "",
  );
}
