import type Database from "better-sqlite3";

export type NodeCompletionState = "incomplete" | "completed";

export interface NodeCompletionUpdate {
  slug: string;
  completed: boolean;
}

export function setNodeCompletion(
  sqlite: Database.Database,
  userId: string,
  slug: string,
  completed: boolean,
): void {
  setNodeCompletions(sqlite, userId, [{ slug, completed }]);
}

export function setNodeCompletions(
  sqlite: Database.Database,
  userId: string,
  updates: readonly NodeCompletionUpdate[],
): void {
  const seen = new Set<string>();
  for (const { slug } of updates) {
    if (!slug) throw new Error("Node completion slug is required");
    if (seen.has(slug)) throw new Error(`Duplicate node completion ${slug}`);
    seen.add(slug);
  }

  sqlite.transaction(() => {
    const user = sqlite.prepare("select 1 from users where id = ?").get(userId);
    if (!user) throw new Error(`Unknown user ${userId}`);
    const findNode = sqlite.prepare(
      "select id from entities where kind = 'node' and slug = ? and retired = 0",
    );
    const resolved = updates.map(({ slug, completed }) => {
      const node = findNode.get(slug) as { id: string } | undefined;
      if (!node) throw new Error(`Unknown active node ${slug}`);
      return { nodeId: node.id, completed };
    });
    const remove = sqlite.prepare(
      "delete from player_node_progress where user_id = ? and node_id = ?",
    );
    const complete = sqlite.prepare(
      `insert into player_node_progress (user_id, node_id, completed_at, updated_at)
       values (?, ?, ?, ?)
       on conflict(user_id, node_id) do update set updated_at = excluded.updated_at`,
    );
    const now = Date.now();
    for (const { nodeId, completed } of resolved) {
      if (completed) complete.run(userId, nodeId, now, now);
      else remove.run(userId, nodeId);
    }
  })();
}

export function getNodeCompletion(
  sqlite: Database.Database,
  userId: string,
  slug: string,
): NodeCompletionState {
  const row = sqlite
    .prepare(
      `select progress.node_id as nodeId
       from entities node
       left join player_node_progress progress
         on progress.node_id = node.id and progress.user_id = ?
       where node.kind = 'node' and node.slug = ? and node.retired = 0`,
    )
    .get(userId, slug) as { nodeId: string | null } | undefined;
  if (!row) throw new Error(`Unknown active node ${slug}`);
  return row.nodeId ? "completed" : "incomplete";
}
