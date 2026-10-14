import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export interface PlayerTodo {
  id: string;
  title: string;
  notes?: string;
  status: "open" | "completed";
  dueAt?: number;
  recurrenceDays?: number;
  recurrenceSourceId?: string;
  createdAt: number;
  updatedAt: number;
  entity?: { kind: string; slug: string; name: string };
}

export function createPlayerTodo(sqlite: Database.Database, userId: string, input: { title: string; notes?: string; dueAt?: number; recurrenceDays?: number; entity?: { kind: string; slug: string } }): string {
  assertUser(sqlite, userId);
  const title = input.title.trim();
  const notes = input.notes?.trim() || undefined;
  if (!title || title.length > 160) throw new Error("Todo title must contain between 1 and 160 characters");
  if (notes && notes.length > 4_000) throw new Error("Todo notes cannot exceed 4000 characters");
  if (input.dueAt !== undefined && !Number.isFinite(input.dueAt)) throw new Error("Todo due date is invalid");
  if (input.recurrenceDays !== undefined && (!Number.isSafeInteger(input.recurrenceDays) || input.recurrenceDays < 1 || input.recurrenceDays > 3_650)) throw new Error("Todo recurrence must be between 1 and 3650 days");
  if (input.recurrenceDays !== undefined && input.dueAt === undefined) throw new Error("Recurring todos require a due date");
  const entity = input.entity ? findEntity(sqlite, input.entity) : undefined;
  const id = randomUUID();
  const now = Date.now();
  sqlite.prepare("insert into player_todos (id, user_id, entity_id, title, notes, status, due_at, recurrence_days, created_at, updated_at) values (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)")
    .run(id, userId, entity?.id ?? null, title, notes ?? null, input.dueAt ?? null, input.recurrenceDays ?? null, now, now);
  return id;
}

export function createEntityTodo(sqlite: Database.Database, userId: string, reference: { kind: string; slug: string }): string {
  const entity = findEntity(sqlite, reference);
  return createPlayerTodo(sqlite, userId, { title: `Review ${entity.name}`.slice(0, 160), entity: reference });
}

export function listPlayerTodos(sqlite: Database.Database, userId: string): PlayerTodo[] {
  assertUser(sqlite, userId);
  const rows = sqlite.prepare(`
    select todo.id, todo.title, todo.notes, todo.status, todo.due_at as dueAt,
      todo.recurrence_days as recurrenceDays, todo.recurrence_source_id as recurrenceSourceId,
      todo.created_at as createdAt, todo.updated_at as updatedAt,
      entity.kind as entityKind, entity.slug as entitySlug, entity.name as entityName
    from player_todos todo left join entities entity on entity.id = todo.entity_id
    where todo.user_id = ?
    order by case todo.status when 'open' then 0 else 1 end,
      case when todo.due_at is null then 1 else 0 end, todo.due_at, todo.created_at desc
  `).all(userId) as Array<Omit<PlayerTodo, "notes" | "dueAt" | "recurrenceDays" | "recurrenceSourceId" | "entity"> & { notes: string | null; dueAt: number | null; recurrenceDays: number | null; recurrenceSourceId: string | null; entityKind: string | null; entitySlug: string | null; entityName: string | null }>;
  return rows.map(({ notes, dueAt, recurrenceDays, recurrenceSourceId, entityKind, entitySlug, entityName, ...row }) => ({
    ...row, notes: notes ?? undefined, dueAt: dueAt ?? undefined, recurrenceDays: recurrenceDays ?? undefined, recurrenceSourceId: recurrenceSourceId ?? undefined,
    entity: entityKind && entitySlug && entityName ? { kind: entityKind, slug: entitySlug, name: entityName } : undefined,
  }));
}

export function setPlayerTodoStatus(sqlite: Database.Database, userId: string, todoId: string, status: PlayerTodo["status"]): void {
  if (status !== "open" && status !== "completed") throw new Error("Todo status is invalid");
  sqlite.transaction(() => {
    const todo = sqlite.prepare(`
      select status, entity_id as entityId, title, notes, due_at as dueAt,
        recurrence_days as recurrenceDays
      from player_todos where id = ? and user_id = ?
    `).get(todoId, userId) as { status: PlayerTodo["status"]; entityId: string | null; title: string; notes: string | null; dueAt: number | null; recurrenceDays: number | null } | undefined;
    if (!todo) throw new Error("Todo not found");
    if (todo.status === status) return;
    const now = Date.now();
    sqlite.prepare("update player_todos set status = ?, updated_at = ? where id = ? and user_id = ?").run(status, now, todoId, userId);
    if (status === "completed" && todo.recurrenceDays !== null && todo.dueAt !== null) {
      sqlite.prepare(`
        insert or ignore into player_todos
          (id, user_id, entity_id, title, notes, status, due_at, recurrence_days,
           recurrence_source_id, created_at, updated_at)
        values (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)
      `).run(randomUUID(), userId, todo.entityId, todo.title, todo.notes, todo.dueAt + todo.recurrenceDays * 86_400_000, todo.recurrenceDays, todoId, now, now);
    }
  })();
}

export function deletePlayerTodo(sqlite: Database.Database, userId: string, todoId: string): void {
  const result = sqlite.prepare("delete from player_todos where id = ? and user_id = ?").run(todoId, userId);
  if (result.changes !== 1) throw new Error("Todo not found");
}

function assertUser(sqlite: Database.Database, userId: string): void {
  if (!sqlite.prepare("select 1 from users where id = ?").get(userId)) throw new Error("Unknown user");
}

function findEntity(sqlite: Database.Database, reference: { kind: string; slug: string }): { id: string; name: string } {
  const entity = sqlite.prepare("select id, name from entities where kind = ? and slug = ? and retired = 0").get(reference.kind, reference.slug) as { id: string; name: string } | undefined;
  if (!entity) throw new Error(`Unknown active entity ${reference.kind}:${reference.slug}`);
  return entity;
}
