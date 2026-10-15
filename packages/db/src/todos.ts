import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export interface PlayerTodo {
  id: string;
  title: string;
  notes?: string;
  status: "open" | "completed";
  dueAt?: number;
  recurrence?: TodoRecurrenceRule;
  recurrenceSourceId?: string;
  createdAt: number;
  updatedAt: number;
  entity?: { kind: string; slug: string; name: string };
}

export type TodoRecurrenceRule =
  | { kind: "days"; interval: number }
  | { kind: "weekly"; weekday: number }
  | { kind: "monthly-date"; day: number }
  | { kind: "monthly-weekday"; weekday: number; ordinal: 1 | 2 | 3 | 4 | -1 }
  | { kind: "yearly"; month: number; day: number };

export type TodoRecurrenceKind = TodoRecurrenceRule["kind"];

export function todoRecurrenceFromAnchor(kind: TodoRecurrenceKind, dueAt: number, interval = 1): TodoRecurrenceRule {
  assertCalendarDate(dueAt);
  const date = new Date(dueAt);
  switch (kind) {
    case "days": return validateTodoRecurrence({ kind, interval });
    case "weekly": return { kind, weekday: date.getUTCDay() };
    case "monthly-date": return { kind, day: date.getUTCDate() };
    case "monthly-weekday": {
      const ordinal = date.getUTCDate() > 28
        ? -1
        : Math.ceil(date.getUTCDate() / 7) as 1 | 2 | 3 | 4;
      return { kind, weekday: date.getUTCDay(), ordinal };
    }
    case "yearly": return { kind, month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  }
}

export function validateTodoRecurrence(value: unknown): TodoRecurrenceRule {
  if (!isRecord(value) || typeof value.kind !== "string") throw new Error("Todo recurrence rule is invalid");
  switch (value.kind) {
    case "days":
      if (!integerBetween(value.interval, 1, 3_650)) throw new Error("Todo recurrence interval must be between 1 and 3650 days");
      return { kind: value.kind, interval: value.interval };
    case "weekly":
      if (!integerBetween(value.weekday, 0, 6)) throw new Error("Todo recurrence weekday is invalid");
      return { kind: value.kind, weekday: value.weekday };
    case "monthly-date":
      if (!integerBetween(value.day, 1, 31)) throw new Error("Todo recurrence day is invalid");
      return { kind: value.kind, day: value.day };
    case "monthly-weekday":
      if (!integerBetween(value.weekday, 0, 6) || ![1, 2, 3, 4, -1].includes(value.ordinal as number)) throw new Error("Todo monthly weekday recurrence is invalid");
      return { kind: value.kind, weekday: value.weekday, ordinal: value.ordinal as 1 | 2 | 3 | 4 | -1 };
    case "yearly":
      if (!integerBetween(value.month, 1, 12) || !integerBetween(value.day, 1, 31) || value.day > daysInMonth(2000, value.month)) throw new Error("Todo yearly recurrence date is invalid");
      return { kind: value.kind, month: value.month, day: value.day };
    default: throw new Error("Todo recurrence kind is invalid");
  }
}

export function nextTodoDueAt(ruleValue: unknown, dueAt: number): number {
  const rule = validateTodoRecurrence(ruleValue);
  assertCalendarDate(dueAt);
  const current = new Date(dueAt);
  if (rule.kind === "days") return dueAt + rule.interval * 86_400_000;
  if (rule.kind === "weekly") {
    const days = (rule.weekday - current.getUTCDay() + 7) % 7 || 7;
    return Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + days);
  }
  if (rule.kind === "yearly") {
    const year = current.getUTCFullYear() + 1;
    return Date.UTC(year, rule.month - 1, Math.min(rule.day, daysInMonth(year, rule.month)));
  }
  const nextMonth = current.getUTCMonth() + 1;
  const year = current.getUTCFullYear() + Math.floor(nextMonth / 12);
  const month = nextMonth % 12;
  if (rule.kind === "monthly-date") return Date.UTC(year, month, Math.min(rule.day, daysInMonth(year, month + 1)));
  if (rule.ordinal === -1) {
    const lastDay = daysInMonth(year, month + 1);
    const lastWeekday = new Date(Date.UTC(year, month, lastDay)).getUTCDay();
    return Date.UTC(year, month, lastDay - ((lastWeekday - rule.weekday + 7) % 7));
  }
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return Date.UTC(year, month, 1 + ((rule.weekday - firstWeekday + 7) % 7) + (rule.ordinal - 1) * 7);
}

export function todoRecurrenceIncludesDate(ruleValue: unknown, dueAt: number): boolean {
  const rule = validateTodoRecurrence(ruleValue);
  assertCalendarDate(dueAt);
  if (rule.kind === "days") return true;
  const date = new Date(dueAt);
  if (rule.kind === "weekly") return date.getUTCDay() === rule.weekday;
  if (rule.kind === "yearly") return date.getUTCMonth() + 1 === rule.month && date.getUTCDate() === Math.min(rule.day, daysInMonth(date.getUTCFullYear(), rule.month));
  if (rule.kind === "monthly-date") return date.getUTCDate() === Math.min(rule.day, daysInMonth(date.getUTCFullYear(), date.getUTCMonth() + 1));
  const previousMonth = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1);
  return nextTodoDueAt(rule, previousMonth) === dueAt;
}

export function createPlayerTodo(sqlite: Database.Database, userId: string, input: { title: string; notes?: string; dueAt?: number; recurrence?: TodoRecurrenceRule; entity?: { kind: string; slug: string } }): string {
  assertUser(sqlite, userId);
  const title = input.title.trim();
  const notes = input.notes?.trim() || undefined;
  if (!title || title.length > 160) throw new Error("Todo title must contain between 1 and 160 characters");
  if (notes && notes.length > 4_000) throw new Error("Todo notes cannot exceed 4000 characters");
  if (input.dueAt !== undefined) assertCalendarDate(input.dueAt);
  const recurrence = input.recurrence === undefined ? undefined : validateTodoRecurrence(input.recurrence);
  if (recurrence !== undefined && input.dueAt === undefined) throw new Error("Recurring todos require a due date");
  if (recurrence !== undefined && !todoRecurrenceIncludesDate(recurrence, input.dueAt!)) throw new Error("Todo due date does not match its recurrence rule");
  const entity = input.entity ? findEntity(sqlite, input.entity) : undefined;
  const id = randomUUID();
  const now = Date.now();
  sqlite.prepare("insert into player_todos (id, user_id, entity_id, title, notes, status, due_at, recurrence_rule, created_at, updated_at) values (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)")
    .run(id, userId, entity?.id ?? null, title, notes ?? null, input.dueAt ?? null, recurrence === undefined ? null : JSON.stringify(recurrence), now, now);
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
      todo.recurrence_rule as recurrenceRule, todo.recurrence_source_id as recurrenceSourceId,
      todo.created_at as createdAt, todo.updated_at as updatedAt,
      entity.kind as entityKind, entity.slug as entitySlug, entity.name as entityName
    from player_todos todo left join entities entity on entity.id = todo.entity_id
    where todo.user_id = ?
    order by case todo.status when 'open' then 0 else 1 end,
      case when todo.due_at is null then 1 else 0 end, todo.due_at, todo.created_at desc
  `).all(userId) as Array<Omit<PlayerTodo, "notes" | "dueAt" | "recurrence" | "recurrenceSourceId" | "entity"> & { notes: string | null; dueAt: number | null; recurrenceRule: string | null; recurrenceSourceId: string | null; entityKind: string | null; entitySlug: string | null; entityName: string | null }>;
  return rows.map(({ notes, dueAt, recurrenceRule, recurrenceSourceId, entityKind, entitySlug, entityName, ...row }) => ({
    ...row, notes: notes ?? undefined, dueAt: dueAt ?? undefined, recurrence: recurrenceRule === null ? undefined : validateTodoRecurrence(JSON.parse(recurrenceRule)), recurrenceSourceId: recurrenceSourceId ?? undefined,
    entity: entityKind && entitySlug && entityName ? { kind: entityKind, slug: entitySlug, name: entityName } : undefined,
  }));
}

export function setPlayerTodoStatus(sqlite: Database.Database, userId: string, todoId: string, status: PlayerTodo["status"]): void {
  if (status !== "open" && status !== "completed") throw new Error("Todo status is invalid");
  sqlite.transaction(() => {
    const todo = sqlite.prepare(`
      select status, entity_id as entityId, title, notes, due_at as dueAt,
        recurrence_rule as recurrenceRule
      from player_todos where id = ? and user_id = ?
    `).get(todoId, userId) as { status: PlayerTodo["status"]; entityId: string | null; title: string; notes: string | null; dueAt: number | null; recurrenceRule: string | null } | undefined;
    if (!todo) throw new Error("Todo not found");
    if (todo.status === status) return;
    const now = Date.now();
    sqlite.prepare("update player_todos set status = ?, updated_at = ? where id = ? and user_id = ?").run(status, now, todoId, userId);
    if (status === "completed" && todo.recurrenceRule !== null && todo.dueAt !== null) {
      const recurrence = validateTodoRecurrence(JSON.parse(todo.recurrenceRule));
      sqlite.prepare(`
        insert or ignore into player_todos
          (id, user_id, entity_id, title, notes, status, due_at, recurrence_rule,
           recurrence_source_id, created_at, updated_at)
        values (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)
      `).run(randomUUID(), userId, todo.entityId, todo.title, todo.notes, nextTodoDueAt(recurrence, todo.dueAt), todo.recurrenceRule, todoId, now, now);
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

function assertCalendarDate(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value % 86_400_000 !== 0) throw new Error("Todo due date must be a UTC calendar date");
}

function integerBetween(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
