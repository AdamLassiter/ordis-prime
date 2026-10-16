import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  normalizedAlias,
  type WorldStateWindowKind,
  type WorldStateWindowObservation,
} from "@ordis-prime/domain";
import type { PromotionSource } from "./promotion.ts";

export interface PromoteWorldStateInput {
  source: PromotionSource;
  version: string;
  contentHash: string;
  observedAt: string;
  retrievedAt: string;
  snapshotPath: string;
  windows: WorldStateWindowObservation[];
}

export interface CurrentWorldStateWindow {
  externalId: string;
  kind: WorldStateWindowKind;
  label: string;
  activation?: number;
  expiry?: number;
  state?: string;
  nodeLabel?: string;
  node?: { slug: string; name: string };
  subjectLabels: string[];
  subjects: Array<{ kind: string; slug: string; name: string }>;
  metadata: Record<string, string | number | boolean | null>;
  sourceId: string;
  sourceName: string;
  snapshotVersion: string;
  observedAt: number;
  sourceRecordKey: string;
  sourcePath?: string;
}

export interface WorldStateSourceStatus {
  sourceId: string;
  sourceName: string;
  snapshotVersion: string;
  observedAt: number;
  windowCount: number;
  currentWindowCount: number;
}

export function pruneInactiveWorldStateSnapshots(
  sqlite: Database.Database,
  keepPerSource: number,
): number {
  if (
    !Number.isSafeInteger(keepPerSource) ||
    keepPerSource < 0 ||
    keepPerSource > 100_000
  ) {
    throw new Error(
      "World-state snapshot history limit must be an integer between 0 and 100000",
    );
  }
  return sqlite.transaction(() => {
    const rows = sqlite
      .prepare(
        `
      select id, source_id as sourceId
      from world_state_snapshots
      where active = 0
      order by source_id, observed_at desc, id desc
    `,
      )
      .all() as Array<{ id: string; sourceId: string }>;
    const retainedBySource = new Map<string, number>();
    const remove: string[] = [];
    for (const row of rows) {
      const retained = retainedBySource.get(row.sourceId) ?? 0;
      if (retained < keepPerSource)
        retainedBySource.set(row.sourceId, retained + 1);
      else remove.push(row.id);
    }
    const detachRefresh = sqlite.prepare(
      "update source_refreshes set world_state_snapshot_id = null where world_state_snapshot_id = ?",
    );
    const deleteSnapshot = sqlite.prepare(
      "delete from world_state_snapshots where id = ? and active = 0",
    );
    for (const id of remove) {
      detachRefresh.run(id);
      deleteSnapshot.run(id);
    }
    return remove.length;
  })();
}

export function promoteWorldState(
  sqlite: Database.Database,
  input: PromoteWorldStateInput,
): { snapshotId: string; windowCount: number } {
  validateWorldState(input);
  return sqlite.transaction(() => {
    const observedAt = Date.parse(input.observedAt);
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
        input.source.id,
        input.source.name,
        input.source.homepage,
        input.source.license ?? null,
        input.source.priority,
      );
    const active = sqlite
      .prepare(
        "select id, version, observed_at as observedAt from world_state_snapshots where source_id = ? and active = 1",
      )
      .get(input.source.id) as
      { id: string; version: string; observedAt: number } | undefined;
    if (active && observedAt < active.observedAt)
      throw new Error(
        `World state ${input.source.id}@${input.version} was observed before active snapshot ${active.version}`,
      );
    const existing = sqlite
      .prepare(
        "select id, content_hash as contentHash, active from world_state_snapshots where source_id = ? and version = ?",
      )
      .get(input.source.id, input.version) as
      { id: string; contentHash: string; active: number } | undefined;
    if (existing) {
      if (existing.contentHash !== input.contentHash)
        throw new Error(
          `World state ${input.source.id} reused version ${input.version} with different content`,
        );
      if (existing.active)
        return { snapshotId: existing.id, windowCount: input.windows.length };
      if (active)
        throw new Error(
          `World state ${input.source.id}@${input.version} has already been imported and is not active`,
        );
      sqlite
        .prepare(
          "update world_state_snapshots set active = case when id = ? then 1 else 0 end where source_id = ?",
        )
        .run(existing.id, input.source.id);
      return { snapshotId: existing.id, windowCount: input.windows.length };
    }
    const snapshotId = randomUUID();
    sqlite
      .prepare(
        `
      insert into world_state_snapshots (id, source_id, version, content_hash, observed_at, snapshot_path, active)
      values (?, ?, ?, ?, ?, ?, 0)
    `,
      )
      .run(
        snapshotId,
        input.source.id,
        input.version,
        input.contentHash,
        observedAt,
        input.snapshotPath,
      );
    const insert = sqlite.prepare(`
      insert into world_state_windows
        (snapshot_id, external_id, kind, label, activation, expiry, state, node_label, node_entity_id, subject_labels_json, metadata_json, source_record_key, source_path)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertSubject = sqlite.prepare(
      "insert or ignore into world_state_window_subjects (snapshot_id, window_external_id, entity_id) values (?, ?, ?)",
    );
    for (const window of input.windows) {
      insert.run(
        snapshotId,
        window.externalId,
        window.kind,
        window.label,
        window.activation ? Date.parse(window.activation) : null,
        window.expiry ? Date.parse(window.expiry) : null,
        window.state ?? null,
        window.nodeLabel ?? null,
        resolveWorldStateNode(sqlite, window.nodeLabel) ?? null,
        JSON.stringify(window.subjects?.map(({ label }) => label) ?? []),
        JSON.stringify(window.metadata ?? {}),
        window.evidence.sourceRecordKey,
        window.evidence.path ?? null,
      );
      for (const subject of window.subjects ?? []) {
        const entityId = resolveWorldStateSubject(sqlite, subject);
        if (entityId)
          insertSubject.run(snapshotId, window.externalId, entityId);
      }
    }
    sqlite
      .prepare(
        "update world_state_snapshots set active = 0 where source_id = ?",
      )
      .run(input.source.id);
    sqlite
      .prepare("update world_state_snapshots set active = 1 where id = ?")
      .run(snapshotId);
    return { snapshotId, windowCount: input.windows.length };
  })();
}

export function listCurrentWorldState(
  sqlite: Database.Database,
  now = Date.now(),
): CurrentWorldStateWindow[] {
  const rows = sqlite
    .prepare(
      `
    select window.external_id as externalId, window.kind, window.label, window.activation, window.expiry,
           window.state, window.node_label as nodeLabel, window.subject_labels_json as subjectLabelsJson, window.metadata_json as metadataJson,
           snapshot.id as snapshotId,
           node.slug as nodeSlug, node.name as nodeName,
           source.id as sourceId, source.name as sourceName, snapshot.version as snapshotVersion,
           snapshot.observed_at as observedAt, window.source_record_key as sourceRecordKey,
           window.source_path as sourcePath
    from world_state_windows window
    join world_state_snapshots snapshot on snapshot.id = window.snapshot_id and snapshot.active = 1
    join sources source on source.id = snapshot.source_id
    left join entities node on node.id = window.node_entity_id and node.kind = 'node' and node.retired = 0
    where window.expiry is null or window.expiry > ?
    order by case window.kind when 'cycle' then 0 when 'event' then 1 when 'alert' then 2 when 'fissure' then 3 else 4 end,
             coalesce(window.expiry, 9223372036854775807), window.label collate nocase
  `,
    )
    .all(now) as Array<
    Omit<
      CurrentWorldStateWindow,
      | "activation"
      | "expiry"
      | "state"
      | "nodeLabel"
      | "node"
      | "subjectLabels"
      | "subjects"
      | "metadata"
      | "sourcePath"
    > & {
      snapshotId: string;
      activation: number | null;
      expiry: number | null;
      state: string | null;
      nodeLabel: string | null;
      nodeSlug: string | null;
      nodeName: string | null;
      subjectLabelsJson: string;
      metadataJson: string;
      sourcePath: string | null;
    }
  >;
  const subjectRows = sqlite
    .prepare(
      `
    select subject.snapshot_id as snapshotId, subject.window_external_id as externalId,
      entity.kind, entity.slug, entity.name
    from world_state_window_subjects subject
    join world_state_snapshots snapshot on snapshot.id = subject.snapshot_id and snapshot.active = 1
    join entities entity on entity.id = subject.entity_id and entity.retired = 0
    order by entity.name collate nocase
  `,
    )
    .all() as Array<{
    snapshotId: string;
    externalId: string;
    kind: string;
    slug: string;
    name: string;
  }>;
  const subjects = new Map<string, CurrentWorldStateWindow["subjects"]>();
  for (const subject of subjectRows) {
    const key = `${subject.snapshotId}\0${subject.externalId}`;
    const entries = subjects.get(key) ?? [];
    entries.push({
      kind: subject.kind,
      slug: subject.slug,
      name: subject.name,
    });
    subjects.set(key, entries);
  }
  return rows.map(
    ({
      snapshotId,
      activation,
      expiry,
      state,
      nodeLabel,
      nodeSlug,
      nodeName,
      subjectLabelsJson,
      metadataJson,
      sourcePath,
      ...row
    }) => ({
      ...row,
      activation: activation ?? undefined,
      expiry: expiry ?? undefined,
      state: state ?? undefined,
      nodeLabel: nodeLabel ?? undefined,
      node:
        nodeSlug && nodeName ? { slug: nodeSlug, name: nodeName } : undefined,
      subjectLabels: parseStringArray(subjectLabelsJson),
      subjects: subjects.get(`${snapshotId}\0${row.externalId}`) ?? [],
      metadata: parseMetadata(metadataJson),
      sourcePath: sourcePath ?? undefined,
    }),
  );
}

function resolveWorldStateSubject(
  sqlite: Database.Database,
  subject: NonNullable<WorldStateWindowObservation["subjects"]>[number],
): string | undefined {
  for (const externalId of subject.externalIds ?? []) {
    const match = sqlite
      .prepare(
        "select entity_id as entityId from external_ids where source_id = ? and namespace = ? and value = ?",
      )
      .get(externalId.sourceId, externalId.namespace, externalId.value) as
      { entityId: string } | undefined;
    if (match) return match.entityId;
  }
  const candidates = sqlite
    .prepare(
      `
    select distinct entity.id from entities entity
    left join entity_aliases alias on alias.entity_id = entity.id
    where entity.retired = 0 and (entity.name = ? collate nocase or alias.normalized = ?)
  `,
    )
    .all(subject.label, normalizedAlias(subject.label)) as Array<{
    id: string;
  }>;
  return candidates.length === 1 ? candidates[0]!.id : undefined;
}

function resolveWorldStateNode(
  sqlite: Database.Database,
  nodeLabel: string | undefined,
): string | undefined {
  if (!nodeLabel) return undefined;
  const match = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(nodeLabel);
  const name = (match?.[1] ?? nodeLabel).trim();
  const planet = match?.[2]?.trim();
  const candidates = sqlite
    .prepare(
      `select distinct entity.id from entities entity
       left join entity_aliases alias on alias.entity_id = entity.id
       where entity.kind = 'node' and entity.retired = 0
         and (entity.name = ? collate nocase or alias.normalized = ?)`,
    )
    .all(name, normalizedAlias(name)) as Array<{ id: string }>;
  if (candidates.length === 1) return candidates[0]!.id;
  if (!planet || !candidates.length) return undefined;
  const placeholders = candidates.map(() => "?").join(", ");
  const narrowed = sqlite
    .prepare(
      `
    select distinct detail.entity_id as id from node_details detail
    join source_runs run on run.id = detail.source_run_id and run.status = 'active'
    where detail.entity_id in (${placeholders}) and detail.planet = ? collate nocase
  `,
    )
    .all(...candidates.map(({ id }) => id), planet) as Array<{ id: string }>;
  return narrowed.length === 1 ? narrowed[0]!.id : undefined;
}

export function listWorldStateSourceStatuses(
  sqlite: Database.Database,
  now = Date.now(),
): WorldStateSourceStatus[] {
  return sqlite
    .prepare(
      `
    select source.id as sourceId, source.name as sourceName, snapshot.version as snapshotVersion,
      snapshot.observed_at as observedAt, count(window.external_id) as windowCount,
      sum(case when window.external_id is not null and (window.expiry is null or window.expiry > ?) then 1 else 0 end) as currentWindowCount
    from world_state_snapshots snapshot
    join sources source on source.id = snapshot.source_id
    left join world_state_windows window on window.snapshot_id = snapshot.id
    where snapshot.active = 1
    group by snapshot.id, source.id, source.name, snapshot.version, snapshot.observed_at
    order by source.name collate nocase
  `,
    )
    .all(now) as WorldStateSourceStatus[];
}

function validateWorldState(input: PromoteWorldStateInput): void {
  if (
    !input.version ||
    !input.contentHash ||
    !input.snapshotPath ||
    !Number.isFinite(Date.parse(input.observedAt)) ||
    !Number.isFinite(Date.parse(input.retrievedAt))
  )
    throw new Error("World-state snapshot metadata is invalid");
  const ids = new Set<string>();
  for (const window of input.windows) {
    if (!window.externalId || !window.label || ids.has(window.externalId))
      throw new Error(
        `Invalid or duplicate world-state window ID ${window.externalId}`,
      );
    ids.add(window.externalId);
    if (
      window.evidence.sourceId !== input.source.id ||
      window.evidence.snapshotVersion !== input.version
    )
      throw new Error(
        `World-state evidence does not match snapshot for ${window.externalId}`,
      );
    if (!window.evidence.sourceRecordKey.trim())
      throw new Error(
        `World-state evidence record key is required for ${window.externalId}`,
      );
    if (
      !Number.isFinite(Date.parse(window.evidence.retrievedAt)) ||
      Date.parse(window.evidence.retrievedAt) !== Date.parse(input.retrievedAt)
    )
      throw new Error(
        `World-state evidence retrieval time does not match snapshot for ${window.externalId}`,
      );
    const activation = window.activation
      ? Date.parse(window.activation)
      : undefined;
    const expiry = window.expiry ? Date.parse(window.expiry) : undefined;
    if (activation !== undefined && !Number.isFinite(activation))
      throw new Error(`Invalid activation for ${window.externalId}`);
    if (expiry !== undefined && !Number.isFinite(expiry))
      throw new Error(`Invalid expiry for ${window.externalId}`);
    if (
      activation !== undefined &&
      expiry !== undefined &&
      expiry <= activation
    )
      throw new Error(
        `World-state window ${window.externalId} expires before it activates`,
      );
    if ((window.subjects?.length ?? 0) > 100)
      throw new Error(
        `World-state window ${window.externalId} has too many subjects`,
      );
    for (const subject of window.subjects ?? []) {
      if (!subject.label.trim() || subject.label.length > 240)
        throw new Error(
          `World-state window ${window.externalId} has an invalid subject`,
        );
      for (const externalId of subject.externalIds ?? [])
        if (!externalId.sourceId || !externalId.namespace || !externalId.value)
          throw new Error(
            `World-state window ${window.externalId} has an invalid subject identifier`,
          );
    }
  }
}

function parseMetadata(
  value: string,
): Record<string, string | number | boolean | null> {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, string | number | boolean | null>)
      : {};
  } catch {
    return {};
  }
}

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}
