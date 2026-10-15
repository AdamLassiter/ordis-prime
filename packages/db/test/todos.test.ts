import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createLocalUser,
  createPlayerTodo,
  deletePlayerTodo,
  listPlayerTodos,
  migrateDatabase,
  nextTodoDueAt,
  openSqliteDatabase,
  setPlayerTodoStatus,
  todoRecurrenceFromAnchor,
} from "../src/index.ts";

test("todos are private, ordered, completable, and deletable", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-todos-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "todos.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  const firstUser = createLocalUser(database, { username: "First" });
  const secondUser = createLocalUser(database, { username: "Second" });
  database
    .prepare(
      "insert into entities (id, kind, name, slug, retired, updated_at) values ('forma', 'resource', 'Forma', 'forma', 0, ?)",
    )
    .run(Date.now());
  const later = createPlayerTodo(database, firstUser, {
    title: " Farm Forma ",
    dueAt: Date.parse("2026-10-16T00:00:00.000Z"),
  });
  const sooner = createPlayerTodo(database, firstUser, {
    title: "Check Baro",
    notes: "Relay visit",
    dueAt: Date.parse("2026-10-15T00:00:00.000Z"),
    entity: { kind: "resource", slug: "forma" },
  });
  createPlayerTodo(database, secondUser, { title: "Private task" });

  assert.deepEqual(
    listPlayerTodos(database, firstUser).map(({ id, title }) => ({
      id,
      title,
    })),
    [
      { id: sooner, title: "Check Baro" },
      { id: later, title: "Farm Forma" },
    ],
  );
  assert.deepEqual(listPlayerTodos(database, firstUser)[0]?.entity, {
    kind: "resource",
    slug: "forma",
    name: "Forma",
  });
  assert.throws(
    () =>
      createPlayerTodo(database, firstUser, {
        title: "Missing",
        entity: { kind: "resource", slug: "missing" },
      }),
    /Unknown active entity/,
  );
  setPlayerTodoStatus(database, firstUser, sooner, "completed");
  assert.deepEqual(
    listPlayerTodos(database, firstUser).map(({ id, status }) => ({
      id,
      status,
    })),
    [
      { id: later, status: "open" },
      { id: sooner, status: "completed" },
    ],
  );
  assert.throws(
    () => deletePlayerTodo(database, secondUser, later),
    /not found/,
  );
  deletePlayerTodo(database, firstUser, later);
  assert.equal(listPlayerTodos(database, firstUser).length, 1);
});

test("completing a recurring todo creates its next due occurrence exactly once", async (context) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "ordis-recurring-todos-"),
  );
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "todos.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  const userId = createLocalUser(database, { username: "First" });
  database
    .prepare(
      "insert into entities (id, kind, name, slug, retired, updated_at) values ('forma', 'resource', 'Forma', 'forma', 0, ?)",
    )
    .run(Date.now());
  const dueAt = Date.parse("2026-10-14T00:00:00.000Z");
  const recurrence = { kind: "days", interval: 7 } as const;
  const todoId = createPlayerTodo(database, userId, {
    title: "Weekly Forma",
    dueAt,
    recurrence,
    entity: { kind: "resource", slug: "forma" },
  });

  setPlayerTodoStatus(database, userId, todoId, "completed");
  setPlayerTodoStatus(database, userId, todoId, "completed");
  let todos = listPlayerTodos(database, userId);
  assert.deepEqual(
    todos.map(({ status, dueAt, recurrence, entity }) => ({
      status,
      dueAt,
      recurrence,
      entity,
    })),
    [
      {
        status: "open",
        dueAt: dueAt + 7 * 86_400_000,
        recurrence,
        entity: { kind: "resource", slug: "forma", name: "Forma" },
      },
      {
        status: "completed",
        dueAt,
        recurrence,
        entity: { kind: "resource", slug: "forma", name: "Forma" },
      },
    ],
  );
  setPlayerTodoStatus(database, userId, todoId, "open");
  setPlayerTodoStatus(database, userId, todoId, "completed");
  todos = listPlayerTodos(database, userId);
  assert.equal(todos.length, 2);
  assert.throws(
    () =>
      createPlayerTodo(database, userId, {
        title: "Invalid repeat",
        recurrence,
      }),
    /require a due date/,
  );
});

test("calendar recurrence preserves its anchor across short months and leap years", () => {
  const january31 = Date.parse("2027-01-31T00:00:00.000Z");
  const monthly = todoRecurrenceFromAnchor("monthly-date", january31);
  const february = nextTodoDueAt(monthly, january31);
  assert.equal(new Date(february).toISOString(), "2027-02-28T00:00:00.000Z");
  assert.equal(
    new Date(nextTodoDueAt(monthly, february)).toISOString(),
    "2027-03-31T00:00:00.000Z",
  );

  const firstSunday = todoRecurrenceFromAnchor(
    "monthly-weekday",
    Date.parse("2026-11-01T00:00:00.000Z"),
  );
  assert.deepEqual(firstSunday, {
    kind: "monthly-weekday",
    weekday: 0,
    ordinal: 1,
  });
  assert.equal(
    new Date(
      nextTodoDueAt(firstSunday, Date.parse("2026-11-01T00:00:00.000Z")),
    ).toISOString(),
    "2026-12-06T00:00:00.000Z",
  );
  const lastSunday = todoRecurrenceFromAnchor(
    "monthly-weekday",
    Date.parse("2026-11-29T00:00:00.000Z"),
  );
  assert.deepEqual(lastSunday, {
    kind: "monthly-weekday",
    weekday: 0,
    ordinal: -1,
  });
  assert.equal(
    new Date(
      nextTodoDueAt(lastSunday, Date.parse("2026-11-29T00:00:00.000Z")),
    ).toISOString(),
    "2026-12-27T00:00:00.000Z",
  );

  const leapDay = todoRecurrenceFromAnchor(
    "yearly",
    Date.parse("2028-02-29T00:00:00.000Z"),
  );
  const nonLeap = nextTodoDueAt(
    leapDay,
    Date.parse("2028-02-29T00:00:00.000Z"),
  );
  assert.equal(new Date(nonLeap).toISOString(), "2029-02-28T00:00:00.000Z");
  assert.equal(
    new Date(nextTodoDueAt(leapDay, nonLeap)).toISOString(),
    "2030-02-28T00:00:00.000Z",
  );
  let occurrence = nonLeap;
  for (let year = 2030; year <= 2032; year += 1)
    occurrence = nextTodoDueAt(leapDay, occurrence);
  assert.equal(new Date(occurrence).toISOString(), "2032-02-29T00:00:00.000Z");
});
