import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { migrateDatabase, openSqliteDatabase } from "@ordis-prime/db";
import { createAuth, verifyLocalPassword } from "../lib/auth-factory.ts";

const baseURL = "http://localhost:3000";
const secret = "test-only-auth-secret-that-is-long-enough";
const setupToken = "test-only-setup-token-that-is-long-enough";

test("setup token creates only the first administrator and sessions round-trip", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-auth-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "auth.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  const auth = createAuth(database, { baseURL, secret, setupToken });

  const blocked = await signUp(auth, "admin@example.test", "Administrator");
  assert.equal(blocked.status, 403);

  const created = await signUp(auth, "admin@example.test", "Administrator", setupToken);
  assert.equal(created.status, 200);
  const administrator = database.prepare("select id, role from users where email = ?").get("admin@example.test") as { id: string; role: string };
  assert.equal(administrator.role, "admin");
  assert.equal(await verifyLocalPassword(database, administrator.id, "wrong password"), false);
  assert.equal(await verifyLocalPassword(database, administrator.id, "correct horse battery staple"), true);

  const second = await signUp(auth, "player@example.test", "Player", setupToken);
  assert.equal(second.status, 403);

  const signIn = await auth.handler(new Request(`${baseURL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseURL },
    body: JSON.stringify({ email: "admin@example.test", password: "correct horse battery staple" }),
  }));
  assert.equal(signIn.status, 200);
  const cookie = signIn.headers.get("set-cookie");
  assert.ok(cookie);
  const session = await auth.handler(new Request(`${baseURL}/api/auth/get-session`, { headers: { cookie } }));
  assert.equal(session.status, 200);
  assert.equal((await session.json()).user.role, "admin");
});

test("explicit registration creates players but never accepts a client role", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-auth-open-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "auth.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  const auth = createAuth(database, { baseURL, secret, allowRegistration: true });

  const response = await auth.handler(new Request(`${baseURL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseURL },
    body: JSON.stringify({ email: "player@example.test", password: "correct horse battery staple", name: "Player", role: "admin" }),
  }));
  assert.equal(response.status, 200);
  assert.equal((database.prepare("select role from users").get() as { role: string }).role, "player");
});

function signUp(auth: ReturnType<typeof createAuth>, email: string, name: string, token?: string) {
  const headers = new Headers({ "content-type": "application/json", origin: baseURL });
  if (token) headers.set("x-ordis-setup-token", token);
  return auth.handler(new Request(`${baseURL}/api/auth/sign-up/email`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, name, password: "correct horse battery staple" }),
  }));
}
