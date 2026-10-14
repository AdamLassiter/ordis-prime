import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalUser, listLocalAccounts, migrateDatabase, openSqliteDatabase, setLocalAccountRole } from "../src/index.ts";

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
