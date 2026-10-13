import { createHash, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { WorldStateWindowKind } from "@ordis-prime/domain";
import { listCurrentWorldState, type CurrentWorldStateWindow } from "./world-state.ts";

export type WorldStateWatchTrigger = "active" | "starting" | "ending";

export interface WorldStateWatch {
  id: string;
  kind: WorldStateWindowKind;
  labelContains?: string;
  stateEquals?: string;
  nodeContains?: string;
  trigger: WorldStateWatchTrigger;
  leadMinutes: number;
  enabled: boolean;
  createdAt: number;
}

export interface PlayerNotification {
  id: string;
  watchId: string;
  title: string;
  body: string;
  startsAt?: number;
  expiresAt?: number;
  createdAt: number;
  readAt?: number;
}

export function createWorldStateWatch(sqlite: Database.Database, userId: string, input: Omit<WorldStateWatch, "id" | "enabled" | "createdAt">): string {
  assertUser(sqlite, userId);
  const kind = input.kind;
  const trigger = input.trigger;
  if (!(["cycle", "alert", "fissure", "event", "trader"] as string[]).includes(kind)) throw new Error("Watch kind is invalid");
  if (!(["active", "starting", "ending"] as string[]).includes(trigger)) throw new Error("Watch trigger is invalid");
  if (!Number.isSafeInteger(input.leadMinutes) || input.leadMinutes < 0 || input.leadMinutes > 10_080) throw new Error("Watch lead time must be between 0 and 10080 minutes");
  const labelContains = normalizeFilter(input.labelContains, "label");
  const stateEquals = normalizeFilter(input.stateEquals, "state");
  const nodeContains = normalizeFilter(input.nodeContains, "node");
  const id = randomUUID();
  sqlite.prepare(`
    insert into world_state_watches
      (id, user_id, kind, label_contains, state_equals, node_contains, trigger, lead_minutes, enabled, created_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(id, userId, kind, labelContains ?? null, stateEquals ?? null, nodeContains ?? null, trigger, input.leadMinutes, Date.now());
  return id;
}

export function listWorldStateWatches(sqlite: Database.Database, userId: string): WorldStateWatch[] {
  assertUser(sqlite, userId);
  const rows = sqlite.prepare(`
    select id, kind, label_contains as labelContains, state_equals as stateEquals,
      node_contains as nodeContains, trigger, lead_minutes as leadMinutes, enabled,
      created_at as createdAt
    from world_state_watches where user_id = ? order by created_at desc
  `).all(userId) as Array<Omit<WorldStateWatch, "labelContains" | "stateEquals" | "nodeContains" | "enabled"> & { labelContains: string | null; stateEquals: string | null; nodeContains: string | null; enabled: number }>;
  return rows.map(({ labelContains, stateEquals, nodeContains, enabled, ...row }) => ({ ...row, labelContains: labelContains ?? undefined, stateEquals: stateEquals ?? undefined, nodeContains: nodeContains ?? undefined, enabled: enabled === 1 }));
}

export function deleteWorldStateWatch(sqlite: Database.Database, userId: string, watchId: string): void {
  const result = sqlite.prepare("delete from world_state_watches where id = ? and user_id = ?").run(watchId, userId);
  if (result.changes !== 1) throw new Error("Watch not found");
}

export function evaluateWorldStateWatches(sqlite: Database.Database, now = Date.now(), userId?: string): number {
  const watches = sqlite.prepare(`
    select id, user_id as userId, kind, label_contains as labelContains,
      state_equals as stateEquals, node_contains as nodeContains, trigger,
      lead_minutes as leadMinutes
    from world_state_watches where enabled = 1 ${userId ? "and user_id = ?" : ""}
  `).all(...(userId ? [userId] : [])) as Array<{ id: string; userId: string; kind: WorldStateWindowKind; labelContains: string | null; stateEquals: string | null; nodeContains: string | null; trigger: WorldStateWatchTrigger; leadMinutes: number }>;
  const windows = listCurrentWorldState(sqlite, now);
  const insert = sqlite.prepare(`
    insert or ignore into player_notifications
      (id, user_id, watch_id, occurrence_key, title, body, starts_at, expires_at, created_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return sqlite.transaction(() => {
    let created = 0;
    for (const watch of watches) for (const window of windows) {
      if (!watchMatches(watch, window) || !triggerMatches(watch, window, now)) continue;
      const result = insert.run(randomUUID(), watch.userId, watch.id, occurrenceKey(window), notificationTitle(watch.trigger, window, now), notificationBody(window), window.activation ?? null, window.expiry ?? null, now);
      created += result.changes;
    }
    return created;
  })();
}

export function listPlayerNotifications(sqlite: Database.Database, userId: string, limit = 50): PlayerNotification[] {
  assertUser(sqlite, userId);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new Error("Notification limit is invalid");
  const rows = sqlite.prepare(`
    select id, watch_id as watchId, title, body, starts_at as startsAt,
      expires_at as expiresAt, created_at as createdAt, read_at as readAt
    from player_notifications where user_id = ? order by created_at desc limit ?
  `).all(userId, limit) as Array<Omit<PlayerNotification, "startsAt" | "expiresAt" | "readAt"> & { startsAt: number | null; expiresAt: number | null; readAt: number | null }>;
  return rows.map(({ startsAt, expiresAt, readAt, ...row }) => ({ ...row, startsAt: startsAt ?? undefined, expiresAt: expiresAt ?? undefined, readAt: readAt ?? undefined }));
}

export function markPlayerNotificationRead(sqlite: Database.Database, userId: string, notificationId: string): void {
  const result = sqlite.prepare("update player_notifications set read_at = coalesce(read_at, ?) where id = ? and user_id = ?")
    .run(Date.now(), notificationId, userId);
  if (result.changes !== 1) throw new Error("Notification not found");
}

function watchMatches(watch: { kind: WorldStateWindowKind; labelContains: string | null; stateEquals: string | null; nodeContains: string | null }, window: CurrentWorldStateWindow): boolean {
  return watch.kind === window.kind
    && contains(window.label, watch.labelContains)
    && (!watch.stateEquals || window.state?.toLocaleLowerCase() === watch.stateEquals.toLocaleLowerCase())
    && contains(window.nodeLabel, watch.nodeContains);
}

function triggerMatches(watch: { trigger: WorldStateWatchTrigger; leadMinutes: number }, window: CurrentWorldStateWindow, now: number): boolean {
  const lead = watch.leadMinutes * 60_000;
  if (watch.trigger === "active") return (window.activation === undefined || window.activation <= now) && (window.expiry === undefined || window.expiry > now);
  if (watch.trigger === "starting") return window.activation !== undefined && now >= window.activation - lead && (window.expiry === undefined || window.expiry > now);
  return window.expiry !== undefined && window.expiry > now && now >= window.expiry - lead;
}

function occurrenceKey(window: CurrentWorldStateWindow): string {
  return createHash("sha256").update(JSON.stringify([window.kind, window.label.toLocaleLowerCase(), window.state?.toLocaleLowerCase(), window.nodeLabel?.toLocaleLowerCase(), window.activation, window.expiry])).digest("hex");
}

function notificationTitle(trigger: WorldStateWatchTrigger, window: CurrentWorldStateWindow, now: number): string {
  if (trigger === "ending") return `${window.label} is ending soon`;
  if (trigger === "starting") return window.activation !== undefined && window.activation > now ? `${window.label} starts soon` : `${window.label} has started`;
  return `${window.label} is active`;
}

function notificationBody(window: CurrentWorldStateWindow): string {
  return [window.state, window.nodeLabel].filter(Boolean).join(" · ") || `${window.kind} availability matched your watch`;
}

function contains(value: string | undefined, needle: string | null): boolean {
  return !needle || value?.toLocaleLowerCase().includes(needle.toLocaleLowerCase()) === true;
}

function normalizeFilter(value: string | undefined, label: string): string | undefined {
  const normalized = value?.trim() || undefined;
  if (normalized && normalized.length > 120) throw new Error(`Watch ${label} filter cannot exceed 120 characters`);
  return normalized;
}

function assertUser(sqlite: Database.Database, userId: string): void {
  if (!sqlite.prepare("select 1 from users where id = ?").get(userId)) throw new Error("Unknown user");
}
