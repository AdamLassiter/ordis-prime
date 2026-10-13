import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalUser, createPlayerTodo, deletePlayerTodo, listPlayerTodos, migrateDatabase, openSqliteDatabase, setPlayerTodoStatus } from "../src/index.ts";

test("todos are private, ordered, completable, and deletable", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-todos-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "todos.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  const firstUser = createLocalUser(database, { username: "First" });
  const secondUser = createLocalUser(database, { username: "Second" });
  const later = createPlayerTodo(database, firstUser, { title: " Farm Forma ", dueAt: 2_000 });
  const sooner = createPlayerTodo(database, firstUser, { title: "Check Baro", notes: "Relay visit", dueAt: 1_000 });
  createPlayerTodo(database, secondUser, { title: "Private task" });

  assert.deepEqual(listPlayerTodos(database, firstUser).map(({ id, title }) => ({ id, title })), [{ id: sooner, title: "Check Baro" }, { id: later, title: "Farm Forma" }]);
  setPlayerTodoStatus(database, firstUser, sooner, "completed");
  assert.deepEqual(listPlayerTodos(database, firstUser).map(({ id, status }) => ({ id, status })), [{ id: later, status: "open" }, { id: sooner, status: "completed" }]);
  assert.throws(() => deletePlayerTodo(database, secondUser, later), /not found/);
  deletePlayerTodo(database, firstUser, later);
  assert.equal(listPlayerTodos(database, firstUser).length, 1);
});
