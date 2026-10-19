import type Database from "better-sqlite3";

export type NodeCompletionState = "incomplete" | "completed";

export function setNodeCompletion(
  sqlite: Database.Database,
  userId: string,
  slug: string,
  completed: boolean,
): void {
  const node = sqlite
    .prepare(
      "select id from entities where kind = 'node' and slug = ? and retired = 0",
    )
    .get(slug) as { id: string } | undefined;
  if (!node) throw new Error(`Unknown active node ${slug}`);
  const user = sqlite.prepare("select 1 from users where id = ?").get(userId);
  if (!user) throw new Error(`Unknown user ${userId}`);
  if (!completed) {
    sqlite
      .prepare(
        "delete from player_node_progress where user_id = ? and node_id = ?",
      )
      .run(userId, node.id);
    return;
  }
  const now = Date.now();
  sqlite
    .prepare(
      `insert into player_node_progress (user_id, node_id, completed_at, updated_at)
       values (?, ?, ?, ?)
       on conflict(user_id, node_id) do update set updated_at = excluded.updated_at`,
    )
    .run(userId, node.id, now, now);
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
