import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export interface PlayerTodo {
  id: string;
  title: string;
  notes?: string;
  status: "open" | "completed";
  dueAt?: number;
  createdAt: number;
  updatedAt: number;
}

export function createPlayerTodo(sqlite: Database.Database, userId: string, input: { title: string; notes?: string; dueAt?: number }): string {
  assertUser(sqlite, userId);
  const title = input.title.trim();
  const notes = input.notes?.trim() || undefined;
  if (!title || title.length > 160) throw new Error("Todo title must contain between 1 and 160 characters");
  if (notes && notes.length > 4_000) throw new Error("Todo notes cannot exceed 4000 characters");
  if (input.dueAt !== undefined && !Number.isFinite(input.dueAt)) throw new Error("Todo due date is invalid");
  const id = randomUUID();
  const now = Date.now();
  sqlite.prepare("insert into player_todos (id, user_id, title, notes, status, due_at, created_at, updated_at) values (?, ?, ?, ?, 'open', ?, ?, ?)")
    .run(id, userId, title, notes ?? null, input.dueAt ?? null, now, now);
  return id;
}

export function listPlayerTodos(sqlite: Database.Database, userId: string): PlayerTodo[] {
  assertUser(sqlite, userId);
  const rows = sqlite.prepare(`
    select id, title, notes, status, due_at as dueAt, created_at as createdAt, updated_at as updatedAt
    from player_todos where user_id = ?
    order by case status when 'open' then 0 else 1 end,
      case when due_at is null then 1 else 0 end, due_at, created_at desc
  `).all(userId) as Array<Omit<PlayerTodo, "notes" | "dueAt"> & { notes: string | null; dueAt: number | null }>;
  return rows.map(({ notes, dueAt, ...row }) => ({ ...row, notes: notes ?? undefined, dueAt: dueAt ?? undefined }));
}

export function setPlayerTodoStatus(sqlite: Database.Database, userId: string, todoId: string, status: PlayerTodo["status"]): void {
  if (status !== "open" && status !== "completed") throw new Error("Todo status is invalid");
  const result = sqlite.prepare("update player_todos set status = ?, updated_at = ? where id = ? and user_id = ?")
    .run(status, Date.now(), todoId, userId);
  if (result.changes !== 1) throw new Error("Todo not found");
}

export function deletePlayerTodo(sqlite: Database.Database, userId: string, todoId: string): void {
  const result = sqlite.prepare("delete from player_todos where id = ? and user_id = ?").run(todoId, userId);
  if (result.changes !== 1) throw new Error("Todo not found");
}

function assertUser(sqlite: Database.Database, userId: string): void {
  if (!sqlite.prepare("select 1 from users where id = ?").get(userId)) throw new Error("Unknown user");
}
