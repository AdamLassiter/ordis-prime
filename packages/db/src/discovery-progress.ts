import type Database from "better-sqlite3";
import { DISCOVERY_KINDS } from "./catalog.ts";

export const DISCOVERY_PROGRESS_STATES = [
  "unseen",
  "discovered",
  "completed",
] as const;
export type DiscoveryProgressState = (typeof DISCOVERY_PROGRESS_STATES)[number];

export function setDiscoveryProgress(
  sqlite: Database.Database,
  userId: string,
  reference: { kind: string; slug: string },
  state: DiscoveryProgressState,
): void {
  if (!(DISCOVERY_PROGRESS_STATES as readonly string[]).includes(state))
    throw new Error("Discovery progress state is invalid");
  const entity = sqlite
    .prepare(
      `select id from entities where kind = ? and slug = ? and retired = 0 and kind in (${DISCOVERY_KINDS.map(() => "?").join(", ")})`,
    )
    .get(reference.kind, reference.slug, ...DISCOVERY_KINDS) as
    { id: string } | undefined;
  if (!entity)
    throw new Error(
      `Unknown active discovery ${reference.kind}:${reference.slug}`,
    );
  const user = sqlite.prepare("select 1 from users where id = ?").get(userId);
  if (!user) throw new Error(`Unknown user ${userId}`);
  if (state === "unseen") {
    sqlite
      .prepare(
        "delete from player_discovery_progress where user_id = ? and entity_id = ?",
      )
      .run(userId, entity.id);
    return;
  }
  sqlite
    .prepare(
      `
    insert into player_discovery_progress (user_id, entity_id, state, updated_at)
    values (?, ?, ?, ?)
    on conflict(user_id, entity_id) do update set state = excluded.state, updated_at = excluded.updated_at
  `,
    )
    .run(userId, entity.id, state, Date.now());
}

export function getDiscoveryProgress(
  sqlite: Database.Database,
  userId: string,
  reference: { kind: string; slug: string },
): DiscoveryProgressState {
  const row = sqlite
    .prepare(
      `
    select progress.state from player_discovery_progress progress
    join entities entity on entity.id = progress.entity_id
    where progress.user_id = ? and entity.kind = ? and entity.slug = ? and entity.retired = 0
  `,
    )
    .get(userId, reference.kind, reference.slug) as
    { state: "discovered" | "completed" } | undefined;
  return row?.state ?? "unseen";
}
