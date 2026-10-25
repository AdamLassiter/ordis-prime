import type Database from "better-sqlite3";

export type NodeCompletionState = "incomplete" | "completed";
export const NODE_COMPLETION_MODES = ["normal", "steel-path"] as const;
export type NodeCompletionMode = (typeof NODE_COMPLETION_MODES)[number];

export interface NodeObjectiveReference {
  slug: string;
  sourceId: string;
  objectiveKey: string;
}

export interface NodeCompletionUpdate {
  slug: string;
  completed: boolean;
  mode?: NodeCompletionMode;
}

export function setNodeCompletion(
  sqlite: Database.Database,
  userId: string,
  slug: string,
  completed: boolean,
  mode: NodeCompletionMode = "normal",
): void {
  setNodeCompletions(sqlite, userId, [{ slug, completed, mode }]);
}

export function setNodeCompletions(
  sqlite: Database.Database,
  userId: string,
  updates: readonly NodeCompletionUpdate[],
): void {
  const seen = new Set<string>();
  for (const { slug, mode = "normal" } of updates) {
    if (!slug) throw new Error("Node completion slug is required");
    if (!(NODE_COMPLETION_MODES as readonly string[]).includes(mode))
      throw new Error(`Node completion mode is invalid`);
    const key = `${mode}:${slug}`;
    if (seen.has(key))
      throw new Error(`Duplicate ${mode} node completion ${slug}`);
    seen.add(key);
  }

  sqlite.transaction(() => {
    const user = sqlite.prepare("select 1 from users where id = ?").get(userId);
    if (!user) throw new Error(`Unknown user ${userId}`);
    const findNode = sqlite.prepare(
      "select id from entities where kind = 'node' and slug = ? and retired = 0",
    );
    const resolved = updates.map(({ slug, completed, mode = "normal" }) => {
      const node = findNode.get(slug) as { id: string } | undefined;
      if (!node) throw new Error(`Unknown active node ${slug}`);
      return { nodeId: node.id, completed, mode };
    });
    const remove = sqlite.prepare(
      "delete from player_node_progress where user_id = ? and node_id = ? and mode = ?",
    );
    const complete = sqlite.prepare(
      `insert into player_node_progress (user_id, node_id, mode, completed_at, updated_at)
       values (?, ?, ?, ?, ?)
       on conflict(user_id, node_id, mode) do update set updated_at = excluded.updated_at`,
    );
    const now = Date.now();
    for (const { nodeId, completed, mode } of resolved) {
      if (completed) complete.run(userId, nodeId, mode, now, now);
      else remove.run(userId, nodeId, mode);
    }
  })();
}

export function getNodeCompletion(
  sqlite: Database.Database,
  userId: string,
  slug: string,
  mode: NodeCompletionMode = "normal",
): NodeCompletionState {
  if (!(NODE_COMPLETION_MODES as readonly string[]).includes(mode))
    throw new Error("Node completion mode is invalid");
  const row = sqlite
    .prepare(
      `select progress.node_id as nodeId
       from entities node
       left join player_node_progress progress
         on progress.node_id = node.id and progress.user_id = ? and progress.mode = ?
       where node.kind = 'node' and node.slug = ? and node.retired = 0`,
    )
    .get(userId, mode, slug) as { nodeId: string | null } | undefined;
  if (!row) throw new Error(`Unknown active node ${slug}`);
  return row.nodeId ? "completed" : "incomplete";
}

export function setNodeObjectiveCompletion(
  sqlite: Database.Database,
  userId: string,
  reference: NodeObjectiveReference,
  completed: boolean,
): void {
  if (!reference.slug || !reference.sourceId || !reference.objectiveKey)
    throw new Error("Node objective reference is incomplete");
  sqlite.transaction(() => {
    const objective = sqlite
      .prepare(
        `select objective.node_id as nodeId, objective.label
         from node_objectives objective
         join source_runs run
           on run.id = objective.source_run_id and run.status = 'active'
         join entities node
           on node.id = objective.node_id and node.kind = 'node' and node.retired = 0
         where node.slug = ? and run.source_id = ? and objective.key = ?`,
      )
      .get(reference.slug, reference.sourceId, reference.objectiveKey) as
      { nodeId: string; label: string } | undefined;
    if (!objective)
      throw new Error(
        `Unknown active node objective ${reference.slug}:${reference.sourceId}:${reference.objectiveKey}`,
      );
    const user = sqlite.prepare("select 1 from users where id = ?").get(userId);
    if (!user) throw new Error(`Unknown user ${userId}`);
    if (!completed) {
      sqlite
        .prepare(
          `delete from player_node_objective_progress
           where user_id = ? and node_id = ? and source_id = ? and objective_key = ?`,
        )
        .run(
          userId,
          objective.nodeId,
          reference.sourceId,
          reference.objectiveKey,
        );
      return;
    }
    const now = Date.now();
    sqlite
      .prepare(
        `insert into player_node_objective_progress
           (user_id, node_id, source_id, objective_key, objective_label,
            completed_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?)
         on conflict(user_id, node_id, source_id, objective_key) do update set
           objective_label = excluded.objective_label,
           updated_at = excluded.updated_at`,
      )
      .run(
        userId,
        objective.nodeId,
        reference.sourceId,
        reference.objectiveKey,
        objective.label,
        now,
        now,
      );
  })();
}
