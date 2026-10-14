import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createBuildShare, createLocalUser, createPlayerBuild, deleteLocalAccount, findSharedBuild, listLocalAccounts, listSourceConflicts, migrateDatabase, openSqliteDatabase, reviewSourceConflict, setInventoryEntry, setLocalAccountRole } from "../src/index.ts";

test("account role changes require an administrator and preserve a final admin", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-accounts-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "accounts.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  const firstAdmin = createLocalUser(database, { username: "First admin", email: "first@example.test", role: "admin" });
  const player = createLocalUser(database, { username: "Player", email: "player@example.test" });

  assert.throws(() => setLocalAccountRole(database, { actorUserId: player, targetUserId: player, role: "admin" }), /Administrator access/);
  assert.throws(() => setLocalAccountRole(database, { actorUserId: firstAdmin, targetUserId: firstAdmin, role: "player" }), /final administrator/);
  const now = Date.now();
  database.prepare("insert into sessions (id, user_id, token, expires_at, created_at, updated_at) values ('session', ?, 'token', ?, ?, ?)").run(player, now + 60_000, now, now);
  setLocalAccountRole(database, { actorUserId: firstAdmin, targetUserId: player, role: "admin" });
  assert.equal((database.prepare("select count(*) as count from sessions where user_id = ?").get(player) as { count: number }).count, 0);
  setLocalAccountRole(database, { actorUserId: player, targetUserId: firstAdmin, role: "player" });

  assert.deepEqual(listLocalAccounts(database).map(({ username, email, role, activeSessions }) => ({ username, email, role, activeSessions })), [
    { username: "Player", email: "player@example.test", role: "admin", activeSessions: 0 },
    { username: "First admin", email: "first@example.test", role: "player", activeSessions: 0 },
  ]);
});

test("account deletion removes private state and shares while retaining attributed audits", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-account-delete-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "accounts.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  const remainingAdmin = createLocalUser(database, { username: "Remaining admin", role: "admin" });
  const deletingAdmin = createLocalUser(database, { username: "Leaving admin", email: "leaving@example.test", role: "admin" });
  const now = Date.now();
  database.prepare("insert into entities (id, kind, name, slug, retired, updated_at) values ('weapon', 'weapon', 'Braton', 'braton', 0, ?)").run(now);
  setInventoryEntry(database, deletingAdmin, "weapon", { ownedCount: 1, builtCount: 1, wantedCount: 0 });
  const buildId = createPlayerBuild(database, deletingAdmin, { title: "Private build" });
  const shareKey = createBuildShare(database, deletingAdmin, buildId);
  database.prepare("insert into sources (id, name, homepage, priority, enabled) values ('fixture', 'Fixture', 'https://example.test', 1, 1)").run();
  database.prepare("insert into source_runs (id, source_id, version, content_hash, retrieved_at, status) values ('run', 'fixture', 'v1', 'hash', ?, 'active')").run(now);
  database.prepare("insert into ingestion_conflicts (id, source_run_id, record_key, reason, candidates_json) values ('conflict', 'run', 'record', 'Ambiguous', '[]')").run();
  reviewSourceConflict(database, { sourceId: "fixture", conflictId: "conflict", userId: deletingAdmin, note: "Reviewed before departure", now });

  deleteLocalAccount(database, deletingAdmin);

  assert.equal(listLocalAccounts(database).some(({ id }) => id === deletingAdmin), false);
  assert.equal((database.prepare("select count(*) as count from player_inventory where user_id = ?").get(deletingAdmin) as { count: number }).count, 0);
  assert.equal((database.prepare("select count(*) as count from player_builds where user_id = ?").get(deletingAdmin) as { count: number }).count, 0);
  assert.equal(findSharedBuild(database, shareKey), undefined);
  assert.deepEqual(listSourceConflicts(database, "fixture")[0]?.reviewEvents.map(({ actor, note }) => ({ actor, note })), [{ actor: "Leaving admin", note: "Reviewed before departure" }]);
  assert.equal((database.prepare("select user_id as userId from ingestion_conflict_review_events").get() as { userId: string | null }).userId, null);
  assert.throws(() => deleteLocalAccount(database, remainingAdmin), /final administrator/);
});
