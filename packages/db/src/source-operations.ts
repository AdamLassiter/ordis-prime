import { randomUUID } from "node:crypto";
import type { ExternalIdentifier } from "@ordis-prime/domain";
import type Database from "better-sqlite3";
import type { PromotionSource } from "./promotion.ts";

export interface SourceRefreshRecord {
  id: string;
  status: "running" | "succeeded" | "failed";
  startedAt: number;
  finishedAt?: number;
  sourceRunId?: string;
  worldStateSnapshotId?: string;
  version?: string;
  snapshotPath?: string;
  recordsProcessed?: number;
  error?: string;
}

export interface SourceRefreshMetrics {
  attempts: number;
  succeeded: number;
  failed: number;
  recordsProcessed: number;
  averageDurationMilliseconds?: number;
  recordsPerSecond?: number;
}

export interface SourceConflictRecord {
  id: string;
  sourceRunId: string;
  version: string;
  snapshotPath?: string;
  recordKey: string;
  reason: string;
  candidateIds: string[];
  candidateEntities: Array<{
    id: string;
    kind: string;
    slug: string;
    name: string;
  }>;
  externalIds: ExternalIdentifier[];
  resolvedAt?: number;
  reviewEvents: SourceConflictReviewEvent[];
}

export interface IdentityOverrideRecord {
  ownerSourceId: string;
  externalId: ExternalIdentifier;
  entity: { id: string; kind: string; slug: string; name: string };
  conflictId: string;
  actor: string;
  note: string;
  createdAt: number;
}

export interface SourceConflictReviewEvent {
  id: string;
  action: "reviewed" | "reopened";
  note: string;
  createdAt: number;
  actor: string;
}

export interface ActiveCatalogRelease {
  id: string;
  promotedAt: number;
  sources: Array<{
    sourceId: string;
    sourceName: string;
    sourceRunId: string;
    version: string;
    retrievedAt: number;
  }>;
}

export function getActiveCatalogRelease(
  sqlite: Database.Database,
): ActiveCatalogRelease | undefined {
  const release = sqlite
    .prepare(
      "select id, promoted_at as promotedAt from catalog_releases where active = 1 order by promoted_at desc limit 1",
    )
    .get() as Omit<ActiveCatalogRelease, "sources"> | undefined;
  if (!release) return undefined;
  const sources = sqlite
    .prepare(
      `
    select source.id as sourceId, source.name as sourceName, run.id as sourceRunId,
      run.version, run.retrieved_at as retrievedAt
    from catalog_release_sources member
    join sources source on source.id = member.source_id
    join source_runs run on run.id = member.source_run_id
    where member.release_id = ? order by source.name collate nocase
  `,
    )
    .all(release.id) as ActiveCatalogRelease["sources"];
  return { ...release, sources };
}

export function beginSourceRefresh(
  sqlite: Database.Database,
  source: PromotionSource,
  now = Date.now(),
): string {
  const id = randomUUID();
  sqlite.transaction(() => {
    sqlite
      .prepare(
        `
      insert into sources (id, name, homepage, license, priority, enabled)
      values (?, ?, ?, ?, ?, 1)
      on conflict(id) do update set name = excluded.name, homepage = excluded.homepage,
        license = excluded.license, priority = excluded.priority, enabled = 1
    `,
      )
      .run(
        source.id,
        source.name,
        source.homepage,
        source.license ?? null,
        source.priority,
      );
    sqlite
      .prepare(
        "insert into source_refreshes (id, source_id, status, started_at) values (?, ?, 'running', ?)",
      )
      .run(id, source.id, now);
  })();
  return id;
}

export function completeSourceRefresh(
  sqlite: Database.Database,
  refreshId: string,
  input: {
    sourceRunId?: string;
    worldStateSnapshotId?: string;
    snapshotPath: string;
    recordsProcessed: number;
    finishedAt?: number;
  },
): void {
  if (Boolean(input.sourceRunId) === Boolean(input.worldStateSnapshotId))
    throw new Error(
      "A completed refresh must link exactly one promoted snapshot",
    );
  if (
    !Number.isSafeInteger(input.recordsProcessed) ||
    input.recordsProcessed < 0
  )
    throw new Error(
      "Completed refresh record count must be a non-negative safe integer",
    );
  const result = sqlite
    .prepare(
      `
    update source_refreshes set status = 'succeeded', source_run_id = ?, world_state_snapshot_id = ?, snapshot_path = ?, records_processed = ?, finished_at = ?, error = null
    where id = ? and status = 'running'
  `,
    )
    .run(
      input.sourceRunId ?? null,
      input.worldStateSnapshotId ?? null,
      input.snapshotPath,
      input.recordsProcessed,
      input.finishedAt ?? Date.now(),
      refreshId,
    );
  if (result.changes !== 1)
    throw new Error(`Refresh ${refreshId} is not running`);
}

export function failSourceRefresh(
  sqlite: Database.Database,
  refreshId: string,
  error: unknown,
  input: {
    snapshotPath?: string;
    recordsProcessed?: number;
    finishedAt?: number;
  } = {},
): void {
  if (
    input.recordsProcessed !== undefined &&
    (!Number.isSafeInteger(input.recordsProcessed) ||
      input.recordsProcessed < 0)
  )
    throw new Error(
      "Failed refresh record count must be a non-negative safe integer",
    );
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const result = sqlite
    .prepare(
      `
    update source_refreshes set status = 'failed', snapshot_path = ?, records_processed = ?, finished_at = ?, error = ?
    where id = ? and status = 'running'
  `,
    )
    .run(
      input.snapshotPath ?? null,
      input.recordsProcessed ?? null,
      input.finishedAt ?? Date.now(),
      message.slice(0, 4_000),
      refreshId,
    );
  if (result.changes !== 1)
    throw new Error(`Refresh ${refreshId} is not running`);
}

export function attachSourceRefreshSnapshot(
  sqlite: Database.Database,
  refreshId: string,
  snapshotPath: string,
): void {
  if (!snapshotPath) throw new Error("Refresh snapshot path is required");
  const result = sqlite
    .prepare(
      "update source_refreshes set snapshot_path = ? where id = ? and status = 'running'",
    )
    .run(snapshotPath, refreshId);
  if (result.changes !== 1)
    throw new Error(`Refresh ${refreshId} is not running`);
}

export function listReferencedSnapshotPaths(
  sqlite: Database.Database,
): string[] {
  const rows = sqlite
    .prepare(
      `select snapshot_path as snapshotPath from source_runs where snapshot_path is not null
       union
       select snapshot_path from world_state_snapshots where snapshot_path is not null
       union
       select snapshot_path from source_refreshes where snapshot_path is not null
       order by snapshotPath`,
    )
    .all() as Array<{ snapshotPath: string }>;
  return rows.map(({ snapshotPath }) => snapshotPath);
}

export function pruneFinishedSourceRefreshes(
  sqlite: Database.Database,
  keepPerSource: number,
): number {
  if (
    !Number.isSafeInteger(keepPerSource) ||
    keepPerSource < 0 ||
    keepPerSource > 100_000
  )
    throw new Error(
      "Source refresh history limit must be an integer between 0 and 100000",
    );
  return sqlite.transaction(() => {
    const rows = sqlite
      .prepare(
        `select id, source_id as sourceId from source_refreshes
         where status != 'running'
         order by source_id, started_at desc, rowid desc`,
      )
      .all() as Array<{ id: string; sourceId: string }>;
    const retained = new Map<string, number>();
    const remove: string[] = [];
    for (const row of rows) {
      const count = retained.get(row.sourceId) ?? 0;
      if (count < keepPerSource) retained.set(row.sourceId, count + 1);
      else remove.push(row.id);
    }
    const statement = sqlite.prepare(
      "delete from source_refreshes where id = ? and status != 'running'",
    );
    let deleted = 0;
    for (const id of remove) deleted += statement.run(id).changes;
    return deleted;
  })();
}

export function listSourceRefreshes(
  sqlite: Database.Database,
  sourceId: string,
  limit = 20,
): SourceRefreshRecord[] {
  const normalizedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const rows = sqlite
    .prepare(
      `
    select refresh.id, refresh.status, refresh.started_at as startedAt, refresh.finished_at as finishedAt,
           refresh.source_run_id as sourceRunId, refresh.world_state_snapshot_id as worldStateSnapshotId,
           coalesce(run.version, world.version) as version, refresh.snapshot_path as snapshotPath,
           refresh.records_processed as recordsProcessed, refresh.error
    from source_refreshes refresh
    left join source_runs run on run.id = refresh.source_run_id
    left join world_state_snapshots world on world.id = refresh.world_state_snapshot_id
    where refresh.source_id = ?
    order by refresh.started_at desc, refresh.rowid desc limit ?
  `,
    )
    .all(sourceId, normalizedLimit) as Array<
    Omit<
      SourceRefreshRecord,
      | "finishedAt"
      | "sourceRunId"
      | "worldStateSnapshotId"
      | "version"
      | "snapshotPath"
      | "recordsProcessed"
      | "error"
    > & {
      finishedAt: number | null;
      sourceRunId: string | null;
      worldStateSnapshotId: string | null;
      version: string | null;
      snapshotPath: string | null;
      recordsProcessed: number | null;
      error: string | null;
    }
  >;
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt ?? undefined,
    sourceRunId: row.sourceRunId ?? undefined,
    worldStateSnapshotId: row.worldStateSnapshotId ?? undefined,
    version: row.version ?? undefined,
    snapshotPath: row.snapshotPath ?? undefined,
    recordsProcessed: row.recordsProcessed ?? undefined,
    error: row.error ?? undefined,
  }));
}

export function getSourceRefreshMetrics(
  sqlite: Database.Database,
  sourceId: string,
): SourceRefreshMetrics {
  const row = sqlite
    .prepare(
      `
    select count(*) as attempts,
      coalesce(sum(case when status = 'succeeded' then 1 else 0 end), 0) as succeeded,
      coalesce(sum(case when status = 'failed' then 1 else 0 end), 0) as failed,
      coalesce(sum(case when status = 'succeeded' then records_processed else 0 end), 0) as recordsProcessed,
      avg(case when status = 'succeeded' then finished_at - started_at end) as averageDurationMilliseconds,
      sum(case when status = 'succeeded' then records_processed else 0 end) * 1000.0 /
        nullif(sum(case when status = 'succeeded' then finished_at - started_at else 0 end), 0) as recordsPerSecond
    from source_refreshes where source_id = ?
  `,
    )
    .get(sourceId) as {
    attempts: number;
    succeeded: number;
    failed: number;
    recordsProcessed: number;
    averageDurationMilliseconds: number | null;
    recordsPerSecond: number | null;
  };
  return {
    attempts: row.attempts,
    succeeded: row.succeeded,
    failed: row.failed,
    recordsProcessed: row.recordsProcessed,
    averageDurationMilliseconds: row.averageDurationMilliseconds ?? undefined,
    recordsPerSecond: row.recordsPerSecond ?? undefined,
  };
}

export function listSourceConflicts(
  sqlite: Database.Database,
  sourceId: string,
  limit = 100,
): SourceConflictRecord[] {
  const normalizedLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  const rows = sqlite
    .prepare(
      `
    select conflict.id, conflict.source_run_id as sourceRunId, run.version, run.snapshot_path as snapshotPath,
           conflict.record_key as recordKey, conflict.reason, conflict.candidates_json as candidatesJson,
           conflict.external_ids_json as externalIdsJson,
           conflict.resolved_at as resolvedAt
    from ingestion_conflicts conflict
    join source_runs run on run.id = conflict.source_run_id
    where run.source_id = ?
    order by case when conflict.resolved_at is null then 0 else 1 end, run.retrieved_at desc, conflict.rowid desc
    limit ?
  `,
    )
    .all(sourceId, normalizedLimit) as Array<
    Omit<
      SourceConflictRecord,
      | "candidateIds"
      | "candidateEntities"
      | "externalIds"
      | "snapshotPath"
      | "resolvedAt"
    > & {
      candidatesJson: string;
      externalIdsJson: string;
      snapshotPath: string | null;
      resolvedAt: number | null;
    }
  >;
  const placeholders = rows.map(() => "?").join(", ");
  const events = rows.length
    ? (sqlite
        .prepare(
          `
    select event.id, event.conflict_id as conflictId, event.action, event.note,
           event.created_at as createdAt, coalesce(user.username, event.actor_name) as actor
    from ingestion_conflict_review_events event
    left join users user on user.id = event.user_id
    where event.conflict_id in (${placeholders})
    order by event.created_at, event.rowid
  `,
        )
        .all(...rows.map((row) => row.id)) as Array<
        SourceConflictReviewEvent & { conflictId: string }
      >)
    : [];
  const eventsByConflict = new Map<string, SourceConflictReviewEvent[]>();
  for (const { conflictId, ...event } of events)
    eventsByConflict.set(conflictId, [
      ...(eventsByConflict.get(conflictId) ?? []),
      event,
    ]);
  const candidateIds = [
    ...new Set(
      rows.flatMap(({ candidatesJson }) => parseCandidateIds(candidatesJson)),
    ),
  ];
  const candidates = candidateIds.length
    ? (sqlite
        .prepare(
          `select id, kind, slug, name from entities where id in (${candidateIds.map(() => "?").join(", ")}) order by name collate nocase`,
        )
        .all(...candidateIds) as SourceConflictRecord["candidateEntities"])
    : [];
  const candidatesById = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  return rows.map(
    ({
      candidatesJson,
      externalIdsJson,
      snapshotPath,
      resolvedAt,
      ...row
    }) => ({
      ...row,
      candidateIds: parseCandidateIds(candidatesJson),
      candidateEntities: parseCandidateIds(candidatesJson).flatMap(
        (id) => candidatesById.get(id) ?? [],
      ),
      externalIds: parseExternalIds(externalIdsJson),
      snapshotPath: snapshotPath ?? undefined,
      resolvedAt: resolvedAt ?? undefined,
      reviewEvents: eventsByConflict.get(row.id) ?? [],
    }),
  );
}

export function listIdentityOverrides(
  sqlite: Database.Database,
  ownerSourceId: string,
): IdentityOverrideRecord[] {
  const rows = sqlite
    .prepare(
      `
    select override.owner_source_id as ownerSourceId, override.external_source_id as externalSourceId,
      override.namespace, override.value, override.conflict_id as conflictId,
      override.actor_name as actor, override.note, override.created_at as createdAt,
      entity.id as entityId, entity.kind, entity.slug, entity.name
    from entity_identity_overrides override join entities entity on entity.id = override.entity_id
    where override.owner_source_id = ?
    order by override.created_at desc, override.rowid desc
  `,
    )
    .all(ownerSourceId) as Array<{
    ownerSourceId: string;
    externalSourceId: string;
    namespace: string;
    value: string;
    conflictId: string;
    actor: string;
    note: string;
    createdAt: number;
    entityId: string;
    kind: string;
    slug: string;
    name: string;
  }>;
  return rows.map(
    ({
      externalSourceId,
      namespace,
      value,
      entityId,
      kind,
      slug,
      name,
      ...row
    }) => ({
      ...row,
      externalId: { sourceId: externalSourceId, namespace, value },
      entity: { id: entityId, kind, slug, name },
    }),
  );
}

export function getIdentityOverrideRevision(
  sqlite: Database.Database,
  ownerSourceId: string,
): string | undefined {
  const row = sqlite
    .prepare(
      "select count(*) as count, max(created_at) as latest from entity_identity_override_events where owner_source_id = ?",
    )
    .get(ownerSourceId) as { count: number; latest: number | null };
  return row.count && row.latest !== null
    ? `${row.count}-${row.latest}`
    : undefined;
}

export function bindSourceIdentityOverride(
  sqlite: Database.Database,
  input: {
    sourceId: string;
    conflictId: string;
    userId: string;
    externalId: ExternalIdentifier;
    entityId: string;
    note: string;
    now?: number;
  },
): void {
  const note = validateReviewNote(input.note);
  const now = input.now ?? Date.now();
  sqlite.transaction(() => {
    const conflict = sqlite
      .prepare(
        `
      select conflict.candidates_json as candidatesJson, conflict.external_ids_json as externalIdsJson
      from ingestion_conflicts conflict join source_runs run on run.id = conflict.source_run_id
      where conflict.id = ? and run.source_id = ? and conflict.resolved_at is null
    `,
      )
      .get(input.conflictId, input.sourceId) as
      { candidatesJson: string; externalIdsJson: string } | undefined;
    if (!conflict)
      throw new Error("Conflict is not available for identity binding");
    if (!parseCandidateIds(conflict.candidatesJson).includes(input.entityId))
      throw new Error("Identity override target is not a conflict candidate");
    if (
      !parseExternalIds(conflict.externalIdsJson).some((externalId) =>
        sameExternalId(externalId, input.externalId),
      )
    )
      throw new Error("Identity override key is not part of the conflict");
    if (
      !sqlite
        .prepare("select 1 from entities where id = ? and retired = 0")
        .get(input.entityId)
    )
      throw new Error("Identity override target is not active");
    if (
      sqlite
        .prepare(
          "select 1 from external_ids where source_id = ? and namespace = ? and value = ?",
        )
        .get(
          input.externalId.sourceId,
          input.externalId.namespace,
          input.externalId.value,
        )
    )
      throw new Error("External identifier already has a canonical mapping");
    if (
      sqlite
        .prepare(
          "select 1 from entity_identity_overrides where external_source_id = ? and namespace = ? and value = ?",
        )
        .get(
          input.externalId.sourceId,
          input.externalId.namespace,
          input.externalId.value,
        )
    )
      throw new Error("External identifier already has an identity override");
    const actor = requireActor(sqlite, input.userId);
    sqlite
      .prepare(
        `
      insert into entity_identity_overrides
        (owner_source_id, external_source_id, namespace, value, entity_id, conflict_id, user_id, actor_name, note, created_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        input.sourceId,
        input.externalId.sourceId,
        input.externalId.namespace,
        input.externalId.value,
        input.entityId,
        input.conflictId,
        input.userId,
        actor,
        note,
        now,
      );
    writeOverrideEvent(sqlite, {
      action: "bound",
      ownerSourceId: input.sourceId,
      externalId: input.externalId,
      entityId: input.entityId,
      conflictId: input.conflictId,
      userId: input.userId,
      actor,
      note,
      now,
    });
    resolveConflictWithEvent(
      sqlite,
      input.conflictId,
      input.userId,
      actor,
      `Identity override: ${note}`,
      now,
    );
  })();
}

export function revokeSourceIdentityOverride(
  sqlite: Database.Database,
  input: {
    sourceId: string;
    userId: string;
    externalId: ExternalIdentifier;
    note: string;
    now?: number;
  },
): void {
  const note = validateReviewNote(input.note);
  const now = input.now ?? Date.now();
  sqlite.transaction(() => {
    const override = sqlite
      .prepare(
        `
      select entity_id as entityId, conflict_id as conflictId from entity_identity_overrides
      where owner_source_id = ? and external_source_id = ? and namespace = ? and value = ?
    `,
      )
      .get(
        input.sourceId,
        input.externalId.sourceId,
        input.externalId.namespace,
        input.externalId.value,
      ) as { entityId: string; conflictId: string } | undefined;
    if (!override) throw new Error("Identity override not found");
    const actor = requireActor(sqlite, input.userId);
    sqlite
      .prepare(
        "delete from entity_identity_overrides where external_source_id = ? and namespace = ? and value = ?",
      )
      .run(
        input.externalId.sourceId,
        input.externalId.namespace,
        input.externalId.value,
      );
    sqlite
      .prepare(
        "delete from external_ids where source_id = ? and namespace = ? and value = ? and entity_id = ?",
      )
      .run(
        input.externalId.sourceId,
        input.externalId.namespace,
        input.externalId.value,
        override.entityId,
      );
    writeOverrideEvent(sqlite, {
      action: "revoked",
      ownerSourceId: input.sourceId,
      externalId: input.externalId,
      entityId: override.entityId,
      conflictId: override.conflictId,
      userId: input.userId,
      actor,
      note,
      now,
    });
    const reopened = sqlite
      .prepare(
        "update ingestion_conflicts set resolved_at = null where id = ? and resolved_at is not null",
      )
      .run(override.conflictId);
    if (reopened.changes)
      sqlite
        .prepare(
          `
      insert into ingestion_conflict_review_events (id, conflict_id, user_id, actor_name, action, note, created_at)
      values (?, ?, ?, ?, 'reopened', ?, ?)
    `,
        )
        .run(
          randomUUID(),
          override.conflictId,
          input.userId,
          actor,
          `Identity override revoked: ${note}`,
          now,
        );
  })();
}

export function reviewSourceConflict(
  sqlite: Database.Database,
  input: {
    sourceId: string;
    conflictId: string;
    userId: string;
    note: string;
    now?: number;
  },
): void {
  changeConflictReviewState(sqlite, {
    ...input,
    action: "reviewed",
    resolved: true,
  });
}

export function reopenSourceConflict(
  sqlite: Database.Database,
  input: {
    sourceId: string;
    conflictId: string;
    userId: string;
    note: string;
    now?: number;
  },
): void {
  changeConflictReviewState(sqlite, {
    ...input,
    action: "reopened",
    resolved: false,
  });
}

function changeConflictReviewState(
  sqlite: Database.Database,
  input: {
    sourceId: string;
    conflictId: string;
    userId: string;
    note: string;
    now?: number;
    action: "reviewed" | "reopened";
    resolved: boolean;
  },
): void {
  const note = validateReviewNote(input.note);
  const now = input.now ?? Date.now();
  sqlite.transaction(() => {
    const expectedState = input.resolved
      ? "conflict.resolved_at is null"
      : "conflict.resolved_at is not null";
    const conflict = sqlite
      .prepare(
        `
      select conflict.id from ingestion_conflicts conflict
      join source_runs run on run.id = conflict.source_run_id
      where conflict.id = ? and run.source_id = ? and ${expectedState}
    `,
      )
      .get(input.conflictId, input.sourceId);
    if (!conflict)
      throw new Error(
        `Conflict ${input.conflictId} is not available for ${input.action}`,
      );
    sqlite
      .prepare("update ingestion_conflicts set resolved_at = ? where id = ?")
      .run(input.resolved ? now : null, input.conflictId);
    const actor = sqlite
      .prepare("select username from users where id = ?")
      .get(input.userId) as { username: string } | undefined;
    if (!actor) throw new Error("Conflict review actor not found");
    sqlite
      .prepare(
        `
      insert into ingestion_conflict_review_events (id, conflict_id, user_id, actor_name, action, note, created_at)
      values (?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        randomUUID(),
        input.conflictId,
        input.userId,
        actor.username,
        input.action,
        note,
        now,
      );
  })();
}

function validateReviewNote(value: string): string {
  const note = value.trim();
  if (!note || note.length > 2_000)
    throw new Error("Conflict review note must contain 1 to 2000 characters");
  return note;
}

function requireActor(sqlite: Database.Database, userId: string): string {
  const actor = sqlite
    .prepare("select username from users where id = ?")
    .get(userId) as { username: string } | undefined;
  if (!actor) throw new Error("Conflict review actor not found");
  return actor.username;
}

function resolveConflictWithEvent(
  sqlite: Database.Database,
  conflictId: string,
  userId: string,
  actor: string,
  note: string,
  now: number,
): void {
  sqlite
    .prepare("update ingestion_conflicts set resolved_at = ? where id = ?")
    .run(now, conflictId);
  sqlite
    .prepare(
      `
    insert into ingestion_conflict_review_events (id, conflict_id, user_id, actor_name, action, note, created_at)
    values (?, ?, ?, ?, 'reviewed', ?, ?)
  `,
    )
    .run(randomUUID(), conflictId, userId, actor, note, now);
}

function writeOverrideEvent(
  sqlite: Database.Database,
  input: {
    action: "bound" | "revoked";
    ownerSourceId: string;
    externalId: ExternalIdentifier;
    entityId: string;
    conflictId: string;
    userId: string;
    actor: string;
    note: string;
    now: number;
  },
): void {
  sqlite
    .prepare(
      `
    insert into entity_identity_override_events
      (id, owner_source_id, external_source_id, namespace, value, entity_id, conflict_id, user_id, actor_name, action, note, created_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      randomUUID(),
      input.ownerSourceId,
      input.externalId.sourceId,
      input.externalId.namespace,
      input.externalId.value,
      input.entityId,
      input.conflictId,
      input.userId,
      input.actor,
      input.action,
      input.note,
      input.now,
    );
}

function parseCandidateIds(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parseExternalIds(value: string): ExternalIdentifier[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is ExternalIdentifier =>
            isRecord(item) &&
            typeof item.sourceId === "string" &&
            typeof item.namespace === "string" &&
            typeof item.value === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function sameExternalId(
  left: ExternalIdentifier,
  right: ExternalIdentifier,
): boolean {
  return (
    left.sourceId === right.sourceId &&
    left.namespace === right.namespace &&
    left.value === right.value
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
