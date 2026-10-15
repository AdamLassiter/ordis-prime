import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  BUILD_ENHANCEMENT_SLOTS,
  BUILD_SLOTS,
  configureBuildEquipment,
  createPlayerBuild,
  listPlayerBuilds,
  setBuildEnhancement,
  setBuildEquipment,
  setBuildMod,
  type BuildEnhancementSlot,
  type BuildSlot,
} from "./builds.ts";
import {
  createPlayerTodo,
  listPlayerTodos,
  nextTodoDueAt,
  todoRecurrenceIncludesDate,
  validateTodoRecurrence,
  type PlayerTodo,
} from "./todos.ts";
import {
  createWorldStateWatch,
  listWorldStateWatches,
  type WorldStateWatch,
  type WorldStateWatchTrigger,
} from "./world-state-watches.ts";
import type { WorldStateWindowKind } from "@ordis-prime/domain";

export interface InventoryValues {
  ownedCount: number;
  builtCount: number;
  wantedCount: number;
  mastered?: boolean;
  subsumed?: boolean;
  note?: string;
}

export interface PlayerInventoryEntry extends InventoryValues {
  entityId: string;
  kind: string;
  slug: string;
  name: string;
}

export function findPlayerInventoryEntry(
  sqlite: Database.Database,
  userId: string,
  kind: string,
  slug: string,
): PlayerInventoryEntry | undefined {
  assertUser(sqlite, userId);
  const row = sqlite
    .prepare(
      `
    select entity.id as entityId, entity.kind, entity.slug, entity.name,
           inventory.owned_count as ownedCount, inventory.built_count as builtCount,
           inventory.wanted_count as wantedCount, inventory.mastered, inventory.subsumed,
           inventory.note
    from entities entity
    left join player_inventory inventory on inventory.entity_id = entity.id and inventory.user_id = ?
    where entity.kind = ? and entity.slug = ? and entity.retired = 0
  `,
    )
    .get(userId, kind, slug) as
    | (Omit<PlayerInventoryEntry, "mastered" | "subsumed" | "note"> & {
        mastered: number | null;
        subsumed: number | null;
        note: string | null;
      })
    | undefined;
  if (!row) return undefined;
  return {
    ...row,
    ownedCount: row.ownedCount ?? 0,
    builtCount: row.builtCount ?? 0,
    wantedCount: row.wantedCount ?? 0,
    mastered: sqlToBoolean(row.mastered),
    subsumed: sqlToBoolean(row.subsumed),
    note: row.note ?? undefined,
  };
}

export function setInventoryEntryByReference(
  sqlite: Database.Database,
  userId: string,
  reference: { kind: string; slug: string },
  values: InventoryValues,
): void {
  const entity = sqlite
    .prepare(
      "select id from entities where kind = ? and slug = ? and retired = 0",
    )
    .get(reference.kind, reference.slug) as { id: string } | undefined;
  if (!entity)
    throw new Error(
      `Unknown active entity ${reference.kind}:${reference.slug}`,
    );
  setInventoryEntry(sqlite, userId, entity.id, values);
}

export interface PortableEntityReference {
  externalIds: Array<{ sourceId: string; namespace: string; value: string }>;
  kind: string;
  slug: string;
  name: string;
}

export interface ProfileExport {
  schemaVersion: 11;
  exportedAt: string;
  inventory: Array<InventoryValues & { entity: PortableEntityReference }>;
  goals: Array<{ entity: PortableEntityReference; targetQuantity: number }>;
  recipePreferences: Array<{
    output: PortableEntityReference;
    sourceId: string;
    sourceRecordKey: string;
  }>;
  discoveryProgress: Array<{
    entity: PortableEntityReference;
    state: "discovered" | "completed";
  }>;
  todos: Array<
    Pick<PlayerTodo, "title" | "notes" | "status" | "dueAt" | "recurrence"> & {
      entity?: PortableEntityReference;
      recurrenceFrom?: number;
    }
  >;
  watches: Array<
    Omit<WorldStateWatch, "id" | "createdAt" | "entity"> & {
      entity?: PortableEntityReference;
    }
  >;
  builds: PortableBuild[];
}

export interface PortableBuild {
  title: string;
  category?: string;
  notes?: string;
  equipment: Array<{
    slot: BuildSlot;
    entity: PortableEntityReference;
    notes?: string;
    configuration?: string;
    formaCount: number;
    capacityUpgrade: boolean;
    mods: Array<{
      position: number;
      rank?: number;
      entity: PortableEntityReference;
    }>;
  }>;
  enhancements: Array<{
    slot: BuildEnhancementSlot;
    rank?: number;
    optionKey?: string;
    entity: PortableEntityReference;
  }>;
}

export interface ProfileImportResult {
  inventoryImported: number;
  goalsImported: number;
  recipePreferencesImported: number;
  discoveryProgressImported: number;
  todosImported: number;
  watchesImported: number;
  buildsImported: number;
  unresolved: Array<{
    section:
      | "inventory"
      | "goals"
      | "recipePreferences"
      | "discoveryProgress"
      | "todos"
      | "watches"
      | "builds";
    index: number;
    name: string;
    reason: "missing" | "ambiguous";
  }>;
}

export function createLocalUser(
  sqlite: Database.Database,
  input: {
    username: string;
    email?: string;
    role?: "admin" | "player";
    id?: string;
  },
): string {
  const username = input.username.trim();
  if (!username || username.length > 80)
    throw new Error("Username must contain between 1 and 80 characters");
  const id = input.id ?? randomUUID();
  const email = input.email?.trim().toLowerCase() ?? `${id}@local.invalid`;
  const now = Date.now();
  sqlite
    .prepare(
      "insert into users (id, username, email, email_verified, role, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(id, username, email, 0, input.role ?? "player", now, now);
  return id;
}

export function setInventoryEntry(
  sqlite: Database.Database,
  userId: string,
  entityId: string,
  values: InventoryValues,
): void {
  const normalized = validateInventoryValues(values);
  assertUserAndEntity(sqlite, userId, entityId);
  sqlite
    .prepare(
      `
    insert into player_inventory
      (user_id, entity_id, owned_count, built_count, wanted_count, mastered, subsumed, note, updated_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(user_id, entity_id) do update set
      owned_count = excluded.owned_count,
      built_count = excluded.built_count,
      wanted_count = excluded.wanted_count,
      mastered = excluded.mastered,
      subsumed = excluded.subsumed,
      note = excluded.note,
      updated_at = excluded.updated_at
  `,
    )
    .run(
      userId,
      entityId,
      normalized.ownedCount,
      normalized.builtCount,
      normalized.wantedCount,
      booleanToSql(normalized.mastered),
      booleanToSql(normalized.subsumed),
      normalized.note ?? null,
      Date.now(),
    );
}

export function listPlayerInventory(
  sqlite: Database.Database,
  userId: string,
): PlayerInventoryEntry[] {
  assertUser(sqlite, userId);
  const rows = sqlite
    .prepare(
      `
    select inventory.entity_id as entityId, entity.kind, entity.slug, entity.name,
           inventory.owned_count as ownedCount, inventory.built_count as builtCount,
           inventory.wanted_count as wantedCount, inventory.mastered, inventory.subsumed,
           inventory.note
    from player_inventory inventory
    join entities entity on entity.id = inventory.entity_id
    where inventory.user_id = ?
    order by entity.name collate nocase, entity.kind
  `,
    )
    .all(userId) as Array<
    Omit<PlayerInventoryEntry, "mastered" | "subsumed" | "note"> & {
      mastered: number | null;
      subsumed: number | null;
      note: string | null;
    }
  >;
  return rows.map((row) => ({
    ...row,
    mastered: sqlToBoolean(row.mastered),
    subsumed: sqlToBoolean(row.subsumed),
    note: row.note ?? undefined,
  }));
}

export function exportPlayerProfile(
  sqlite: Database.Database,
  userId: string,
): ProfileExport {
  const inventory = listPlayerInventory(sqlite, userId);
  const playerTodos = listPlayerTodos(sqlite, userId);
  const todoIndices = new Map(
    playerTodos.map((todo, index) => [todo.id, index]),
  );
  const identifiers = sqlite.prepare(`
    select source_id as sourceId, namespace, value
    from external_ids
    where entity_id = ?
    order by case source_id when 'wfcd-items' then 0 when 'wfcd-drops' then 1 else 2 end,
             source_id, namespace, value
  `);
  return {
    schemaVersion: 11,
    exportedAt: new Date().toISOString(),
    inventory: inventory.map(({ entityId, kind, slug, name, ...values }) => ({
      entity: {
        externalIds: identifiers.all(
          entityId,
        ) as PortableEntityReference["externalIds"],
        kind,
        slug,
        name,
      },
      ...values,
    })),
    goals: (
      sqlite
        .prepare(
          `
      select goal.entity_id as entityId, entity.kind, entity.slug, entity.name, goal.target_quantity as targetQuantity
      from player_goals goal join entities entity on entity.id = goal.entity_id
      where goal.user_id = ? order by entity.name collate nocase, entity.kind
    `,
        )
        .all(userId) as Array<{
        entityId: string;
        kind: string;
        slug: string;
        name: string;
        targetQuantity: number;
      }>
    ).map(({ entityId, kind, slug, name, targetQuantity }) => ({
      entity: {
        externalIds: identifiers.all(
          entityId,
        ) as PortableEntityReference["externalIds"],
        kind,
        slug,
        name,
      },
      targetQuantity,
    })),
    recipePreferences: (
      sqlite
        .prepare(
          `
      select preference.output_entity_id as entityId, entity.kind, entity.slug, entity.name,
        preference.source_id as sourceId, preference.source_record_key as sourceRecordKey
      from player_recipe_preferences preference join entities entity on entity.id = preference.output_entity_id
      where preference.user_id = ? order by entity.name collate nocase, entity.kind
    `,
        )
        .all(userId) as Array<{
        entityId: string;
        kind: string;
        slug: string;
        name: string;
        sourceId: string;
        sourceRecordKey: string;
      }>
    ).map(({ entityId, kind, slug, name, sourceId, sourceRecordKey }) => ({
      output: {
        externalIds: identifiers.all(
          entityId,
        ) as PortableEntityReference["externalIds"],
        kind,
        slug,
        name,
      },
      sourceId,
      sourceRecordKey,
    })),
    discoveryProgress: (
      sqlite
        .prepare(
          `
      select progress.entity_id as entityId, entity.kind, entity.slug, entity.name, progress.state
      from player_discovery_progress progress join entities entity on entity.id = progress.entity_id
      where progress.user_id = ? order by entity.name collate nocase, entity.kind
    `,
        )
        .all(userId) as Array<{
        entityId: string;
        kind: string;
        slug: string;
        name: string;
        state: "discovered" | "completed";
      }>
    ).map(({ entityId, kind, slug, name, state }) => ({
      entity: {
        externalIds: identifiers.all(
          entityId,
        ) as PortableEntityReference["externalIds"],
        kind,
        slug,
        name,
      },
      state,
    })),
    todos: playerTodos.map(
      ({
        title,
        notes,
        status,
        dueAt,
        recurrence,
        recurrenceSourceId,
        entity,
      }) => ({
        title,
        notes,
        status,
        dueAt,
        recurrence,
        entity: entity
          ? portableReferenceForCatalogEntity(sqlite, identifiers, entity)
          : undefined,
        recurrenceFrom:
          recurrenceSourceId === undefined
            ? undefined
            : todoIndices.get(recurrenceSourceId),
      }),
    ),
    watches: listWorldStateWatches(sqlite, userId).map(
      ({ id: _id, createdAt: _createdAt, entity, ...watch }) => ({
        ...watch,
        entity: entity
          ? portableReferenceForCatalogEntity(sqlite, identifiers, entity)
          : undefined,
      }),
    ),
    builds: listPlayerBuilds(sqlite, userId).map(
      ({ title, category, notes, equipment, enhancements }) => ({
        title,
        category,
        notes,
        equipment: equipment.map(
          ({
            slot,
            entity,
            notes: equipmentNotes,
            configuration,
            formaCount,
            capacityUpgrade,
            mods,
          }) => ({
            slot,
            entity: portableReferenceForCatalogEntity(
              sqlite,
              identifiers,
              entity,
            ),
            notes: equipmentNotes,
            configuration,
            formaCount,
            capacityUpgrade,
            mods: mods.map(({ position, rank, entity: mod }) => ({
              position,
              rank,
              entity: portableReferenceForCatalogEntity(
                sqlite,
                identifiers,
                mod,
              ),
            })),
          }),
        ),
        enhancements: enhancements.map(({ slot, rank, option, entity }) => ({
          slot,
          rank,
          optionKey: option?.key,
          entity: portableReferenceForCatalogEntity(
            sqlite,
            identifiers,
            entity,
          ),
        })),
      }),
    ),
  };
}

export function importPlayerProfile(
  sqlite: Database.Database,
  userId: string,
  value: unknown,
  options: { mode?: "merge" | "replace" } = {},
): ProfileImportResult {
  assertUser(sqlite, userId);
  const profile = parseProfile(value);
  const resolvedInventory: Array<{
    entityId: string;
    values: InventoryValues;
  }> = [];
  const resolvedGoals: Array<{ entityId: string; targetQuantity: number }> = [];
  const resolvedRecipePreferences: Array<{
    outputEntityId: string;
    sourceId: string;
    sourceRecordKey: string;
  }> = [];
  const resolvedDiscoveryProgress: Array<{
    entityId: string;
    state: "discovered" | "completed";
  }> = [];
  const resolvedTodos: Array<
    Omit<ProfileExport["todos"][number], "entity"> & {
      entity?: { kind: string; slug: string };
    }
  > = [];
  const resolvedWatches: Array<
    Omit<ProfileExport["watches"][number], "entity"> & {
      entity?: { kind: string; slug: string };
    }
  > = [];
  const resolvedBuilds: Array<{
    build: PortableBuild;
    equipment: Array<{
      slot: BuildSlot;
      reference: { kind: string; slug: string };
      notes?: string;
      configuration?: string;
      formaCount: number;
      capacityUpgrade: boolean;
      mods: Array<{
        position: number;
        rank?: number;
        reference: { kind: string; slug: string };
      }>;
    }>;
    enhancements: Array<{
      slot: BuildEnhancementSlot;
      rank?: number;
      optionKey?: string;
      reference: { kind: string; slug: string };
    }>;
  }> = [];
  const unresolved: ProfileImportResult["unresolved"] = [];

  for (const [index, entry] of profile.inventory.entries()) {
    const resolution = resolvePortableEntity(sqlite, entry.entity);
    if (resolution.reason) {
      unresolved.push({
        section: "inventory",
        index,
        name: entry.entity.name,
        reason: resolution.reason,
      });
      continue;
    }
    resolvedInventory.push({
      entityId: resolution.entityId!,
      values: validateInventoryValues(entry),
    });
  }
  for (const [index, goal] of profile.goals.entries()) {
    const resolution = resolvePortableEntity(sqlite, goal.entity);
    if (resolution.reason) {
      unresolved.push({
        section: "goals",
        index,
        name: goal.entity.name,
        reason: resolution.reason,
      });
      continue;
    }
    resolvedGoals.push({
      entityId: resolution.entityId!,
      targetQuantity: goal.targetQuantity,
    });
  }
  for (const [index, preference] of profile.recipePreferences.entries()) {
    const resolution = resolvePortableEntity(sqlite, preference.output);
    if (resolution.reason) {
      unresolved.push({
        section: "recipePreferences",
        index,
        name: preference.output.name,
        reason: resolution.reason,
      });
      continue;
    }
    const active = sqlite
      .prepare(
        `
      select 1 from recipes recipe join source_runs run on run.id = recipe.source_run_id and run.status = 'active'
      where recipe.output_id = ? and run.source_id = ? and recipe.source_record_key = ?
    `,
      )
      .get(
        resolution.entityId!,
        preference.sourceId,
        preference.sourceRecordKey,
      );
    if (!active) {
      unresolved.push({
        section: "recipePreferences",
        index,
        name: preference.output.name,
        reason: "missing",
      });
      continue;
    }
    resolvedRecipePreferences.push({
      outputEntityId: resolution.entityId!,
      sourceId: preference.sourceId,
      sourceRecordKey: preference.sourceRecordKey,
    });
  }
  for (const [index, progress] of profile.discoveryProgress.entries()) {
    const resolution = resolvePortableEntity(sqlite, progress.entity);
    if (resolution.reason) {
      unresolved.push({
        section: "discoveryProgress",
        index,
        name: progress.entity.name,
        reason: resolution.reason,
      });
      continue;
    }
    resolvedDiscoveryProgress.push({
      entityId: resolution.entityId!,
      state: progress.state,
    });
  }
  for (const [index, todo] of profile.todos.entries()) {
    if (!todo.entity) {
      resolvedTodos.push(todo);
      continue;
    }
    const resolution = resolvePortableEntity(sqlite, todo.entity);
    if (resolution.reason) {
      unresolved.push({
        section: "todos",
        index,
        name: todo.entity.name,
        reason: resolution.reason,
      });
      const { entity: _entity, ...unlinked } = todo;
      resolvedTodos.push(unlinked);
      continue;
    }
    resolvedTodos.push({
      ...todo,
      entity: catalogReferenceById(sqlite, resolution.entityId!),
    });
  }
  for (const [index, watch] of profile.watches.entries()) {
    if (!watch.entity) {
      resolvedWatches.push(watch);
      continue;
    }
    const resolution = resolvePortableEntity(sqlite, watch.entity);
    if (resolution.reason) {
      unresolved.push({
        section: "watches",
        index,
        name: watch.entity.name,
        reason: resolution.reason,
      });
      const { entity: _entity, ...unlinked } = watch;
      resolvedWatches.push(unlinked);
      continue;
    }
    resolvedWatches.push({
      ...watch,
      entity: catalogReferenceById(sqlite, resolution.entityId!),
    });
  }
  for (const [index, build] of profile.builds.entries()) {
    let complete = true;
    const equipment = build.equipment.map((entry) => {
      const equipmentResolution = resolvePortableEntity(sqlite, entry.entity);
      if (equipmentResolution.reason) {
        unresolved.push({
          section: "builds",
          index,
          name: `${build.title}: ${entry.entity.name}`,
          reason: equipmentResolution.reason,
        });
        complete = false;
      }
      const mods = entry.mods.map((mod) => {
        const modResolution = resolvePortableEntity(sqlite, mod.entity);
        if (modResolution.reason) {
          unresolved.push({
            section: "builds",
            index,
            name: `${build.title}: ${mod.entity.name}`,
            reason: modResolution.reason,
          });
          complete = false;
        }
        return {
          position: mod.position,
          rank: mod.rank,
          reference: modResolution.entityId
            ? catalogReferenceById(sqlite, modResolution.entityId)
            : { kind: mod.entity.kind, slug: mod.entity.slug },
        };
      });
      return {
        slot: entry.slot,
        reference: equipmentResolution.entityId
          ? catalogReferenceById(sqlite, equipmentResolution.entityId)
          : { kind: entry.entity.kind, slug: entry.entity.slug },
        notes: entry.notes,
        configuration: entry.configuration,
        formaCount: entry.formaCount,
        capacityUpgrade: entry.capacityUpgrade,
        mods,
      };
    });
    const enhancements = build.enhancements.map((entry) => {
      const resolution = resolvePortableEntity(sqlite, entry.entity);
      if (resolution.reason) {
        unresolved.push({
          section: "builds",
          index,
          name: `${build.title}: ${entry.entity.name}`,
          reason: resolution.reason,
        });
        complete = false;
      }
      if (
        resolution.entityId &&
        entry.optionKey &&
        !sqlite
          .prepare(
            `
        select 1 from entity_enhancement_options option
        join source_runs run on run.id = option.source_run_id and run.status = 'active'
        where option.entity_id = ? and option.key = ? limit 1
      `,
          )
          .get(resolution.entityId, entry.optionKey)
      ) {
        unresolved.push({
          section: "builds",
          index,
          name: `${build.title}: ${entry.entity.name} effect ${entry.optionKey}`,
          reason: "missing",
        });
        complete = false;
      }
      return {
        slot: entry.slot,
        rank: entry.rank,
        optionKey: entry.optionKey,
        reference: resolution.entityId
          ? catalogReferenceById(sqlite, resolution.entityId)
          : { kind: entry.entity.kind, slug: entry.entity.slug },
      };
    });
    if (complete) resolvedBuilds.push({ build, equipment, enhancements });
  }

  sqlite.transaction(() => {
    if (options.mode === "replace") {
      sqlite
        .prepare("delete from player_inventory where user_id = ?")
        .run(userId);
      sqlite.prepare("delete from player_goals where user_id = ?").run(userId);
      sqlite
        .prepare("delete from player_recipe_preferences where user_id = ?")
        .run(userId);
      sqlite
        .prepare("delete from player_discovery_progress where user_id = ?")
        .run(userId);
      sqlite.prepare("delete from player_todos where user_id = ?").run(userId);
      sqlite
        .prepare("delete from world_state_watches where user_id = ?")
        .run(userId);
      sqlite.prepare("delete from player_builds where user_id = ?").run(userId);
    }
    for (const entry of resolvedInventory)
      setInventoryEntry(sqlite, userId, entry.entityId, entry.values);
    const writeGoal = sqlite.prepare(`
      insert into player_goals (user_id, entity_id, target_quantity, created_at, updated_at)
      values (?, ?, ?, ?, ?)
      on conflict(user_id, entity_id) do update set target_quantity = excluded.target_quantity, updated_at = excluded.updated_at
    `);
    for (const goal of resolvedGoals) {
      const now = Date.now();
      writeGoal.run(userId, goal.entityId, goal.targetQuantity, now, now);
    }
    const writePreference = sqlite.prepare(`
      insert into player_recipe_preferences (user_id, output_entity_id, source_id, source_record_key, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?)
      on conflict(user_id, output_entity_id) do update set source_id = excluded.source_id,
        source_record_key = excluded.source_record_key, updated_at = excluded.updated_at
    `);
    for (const preference of resolvedRecipePreferences) {
      const now = Date.now();
      writePreference.run(
        userId,
        preference.outputEntityId,
        preference.sourceId,
        preference.sourceRecordKey,
        now,
        now,
      );
    }
    const writeProgress = sqlite.prepare(`
      insert into player_discovery_progress (user_id, entity_id, state, updated_at) values (?, ?, ?, ?)
      on conflict(user_id, entity_id) do update set state = excluded.state, updated_at = excluded.updated_at
    `);
    for (const progress of resolvedDiscoveryProgress)
      writeProgress.run(userId, progress.entityId, progress.state, Date.now());
    const importedTodoIds: string[] = [];
    for (const todo of resolvedTodos) {
      const id = createPlayerTodo(sqlite, userId, todo);
      importedTodoIds.push(id);
      if (todo.status === "completed")
        sqlite
          .prepare(
            "update player_todos set status = 'completed', updated_at = ? where id = ? and user_id = ?",
          )
          .run(Date.now(), id, userId);
    }
    for (const [index, todo] of resolvedTodos.entries()) {
      if (todo.recurrenceFrom === undefined) continue;
      sqlite
        .prepare(
          "update player_todos set recurrence_source_id = ? where id = ? and user_id = ?",
        )
        .run(
          importedTodoIds[todo.recurrenceFrom],
          importedTodoIds[index],
          userId,
        );
    }
    for (const watch of resolvedWatches) {
      const id = createWorldStateWatch(sqlite, userId, watch);
      if (!watch.enabled)
        sqlite
          .prepare(
            "update world_state_watches set enabled = 0 where id = ? and user_id = ?",
          )
          .run(id, userId);
    }
    for (const { build, equipment, enhancements } of resolvedBuilds) {
      const buildId = createPlayerBuild(sqlite, userId, build);
      for (const entry of equipment) {
        setBuildEquipment(
          sqlite,
          userId,
          buildId,
          entry.slot,
          entry.reference,
          entry.notes,
        );
        configureBuildEquipment(sqlite, userId, buildId, entry.slot, entry);
        for (const mod of entry.mods)
          setBuildMod(
            sqlite,
            userId,
            buildId,
            entry.slot,
            mod.position,
            mod.reference,
            mod.rank,
          );
      }
      for (const enhancement of enhancements)
        setBuildEnhancement(
          sqlite,
          userId,
          buildId,
          enhancement.slot,
          enhancement.reference,
          enhancement.rank,
          enhancement.optionKey,
        );
    }
  })();
  return {
    inventoryImported: resolvedInventory.length,
    goalsImported: resolvedGoals.length,
    recipePreferencesImported: resolvedRecipePreferences.length,
    discoveryProgressImported: resolvedDiscoveryProgress.length,
    todosImported: resolvedTodos.length,
    watchesImported: resolvedWatches.length,
    buildsImported: resolvedBuilds.length,
    unresolved,
  };
}

function parseProfile(value: unknown): ProfileExport {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 11 ||
    !Array.isArray(value.inventory) ||
    !Array.isArray(value.goals) ||
    !Array.isArray(value.recipePreferences) ||
    !Array.isArray(value.discoveryProgress) ||
    !Array.isArray(value.todos) ||
    !Array.isArray(value.watches) ||
    !Array.isArray(value.builds)
  )
    throw new Error(
      "Profile must use schemaVersion 11 and contain every portable state array",
    );
  const inventory = value.inventory.map((entry, index) => {
    if (!isRecord(entry))
      throw new Error(`Profile inventory entry ${index} is invalid`);
    const entity = parsePortableEntity(
      entry.entity,
      `inventory entry ${index}`,
    );
    const values = validateInventoryValues(entry);
    return { ...values, entity };
  });
  const goals = value.goals.map((entry, index) => {
    if (
      !isRecord(entry) ||
      !Number.isSafeInteger(entry.targetQuantity) ||
      (entry.targetQuantity as number) <= 0
    )
      throw new Error(
        `Profile goal entry ${index} has an invalid targetQuantity`,
      );
    return {
      entity: parsePortableEntity(entry.entity, `goal entry ${index}`),
      targetQuantity: entry.targetQuantity as number,
    };
  });
  const recipePreferences = value.recipePreferences.map((entry, index) => {
    if (
      !isRecord(entry) ||
      typeof entry.sourceId !== "string" ||
      !entry.sourceId ||
      typeof entry.sourceRecordKey !== "string" ||
      !entry.sourceRecordKey
    )
      throw new Error(`Profile recipe preference entry ${index} is invalid`);
    return {
      output: parsePortableEntity(
        entry.output,
        `recipe preference entry ${index}`,
      ),
      sourceId: entry.sourceId,
      sourceRecordKey: entry.sourceRecordKey,
    };
  });
  const discoveryProgress = value.discoveryProgress.map((entry, index) => {
    if (
      !isRecord(entry) ||
      (entry.state !== "discovered" && entry.state !== "completed")
    )
      throw new Error(
        `Profile discovery progress entry ${index} has an invalid state`,
      );
    return {
      entity: parsePortableEntity(
        entry.entity,
        `discovery progress entry ${index}`,
      ),
      state: entry.state as "discovered" | "completed",
    };
  });
  const todos = value.todos.map((entry, index) =>
    parsePortableTodo(entry, index),
  );
  for (const [index, todo] of todos.entries()) {
    if (todo.recurrenceFrom === undefined) continue;
    const predecessor = todos[todo.recurrenceFrom];
    if (
      !predecessor ||
      todo.recurrenceFrom === index ||
      predecessor.recurrence === undefined ||
      todo.recurrence === undefined ||
      JSON.stringify(predecessor.recurrence) !==
        JSON.stringify(todo.recurrence) ||
      predecessor.dueAt === undefined ||
      todo.dueAt !== nextTodoDueAt(predecessor.recurrence, predecessor.dueAt)
    ) {
      throw new Error(
        `Profile todo entry ${index} has an invalid recurrenceFrom`,
      );
    }
  }
  const watches = value.watches.map((entry, index) =>
    parsePortableWatch(entry, index),
  );
  const builds = value.builds.map((entry, index) =>
    parsePortableBuild(entry, index),
  );
  return {
    schemaVersion: 11,
    exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : "",
    inventory,
    goals,
    recipePreferences,
    discoveryProgress,
    todos,
    watches,
    builds,
  };
}

function parsePortableTodo(
  value: unknown,
  index: number,
): ProfileExport["todos"][number] {
  if (
    !isRecord(value) ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    value.title.length > 160 ||
    (value.status !== "open" && value.status !== "completed")
  )
    throw new Error(`Profile todo entry ${index} is invalid`);
  const notes = optionalText(value.notes, 4_000, `todo entry ${index} notes`);
  if (
    value.dueAt !== undefined &&
    (!Number.isSafeInteger(value.dueAt) ||
      (value.dueAt as number) < 0 ||
      (value.dueAt as number) % 86_400_000 !== 0)
  )
    throw new Error(`Profile todo entry ${index} has an invalid dueAt`);
  let recurrence: PlayerTodo["recurrence"];
  if (value.recurrence !== undefined) {
    if (value.dueAt === undefined)
      throw new Error(
        `Profile todo entry ${index} has a recurrence without dueAt`,
      );
    try {
      recurrence = validateTodoRecurrence(value.recurrence);
      if (!todoRecurrenceIncludesDate(recurrence, value.dueAt as number))
        throw new Error("mismatch");
    } catch {
      throw new Error(`Profile todo entry ${index} has an invalid recurrence`);
    }
  }
  const entity =
    value.entity === undefined
      ? undefined
      : parsePortableEntity(value.entity, `todo entry ${index}`);
  if (
    value.recurrenceFrom !== undefined &&
    (!Number.isSafeInteger(value.recurrenceFrom) ||
      (value.recurrenceFrom as number) < 0)
  )
    throw new Error(
      `Profile todo entry ${index} has an invalid recurrenceFrom`,
    );
  return {
    title: value.title,
    notes,
    status: value.status,
    dueAt: value.dueAt as number | undefined,
    recurrence,
    entity,
    recurrenceFrom: value.recurrenceFrom as number | undefined,
  };
}

function parsePortableWatch(
  value: unknown,
  index: number,
): ProfileExport["watches"][number] {
  if (
    !isRecord(value) ||
    !(WATCH_KINDS as readonly unknown[]).includes(value.kind) ||
    !(WATCH_TRIGGERS as readonly unknown[]).includes(value.trigger) ||
    typeof value.enabled !== "boolean" ||
    !Number.isSafeInteger(value.leadMinutes) ||
    (value.leadMinutes as number) < 0 ||
    (value.leadMinutes as number) > 10_080
  )
    throw new Error(`Profile watch entry ${index} is invalid`);
  return {
    kind: value.kind as WorldStateWindowKind,
    trigger: value.trigger as WorldStateWatchTrigger,
    leadMinutes: value.leadMinutes as number,
    enabled: value.enabled,
    labelContains: optionalText(
      value.labelContains,
      120,
      `watch entry ${index} labelContains`,
    ),
    stateEquals: optionalText(
      value.stateEquals,
      120,
      `watch entry ${index} stateEquals`,
    ),
    nodeContains: optionalText(
      value.nodeContains,
      120,
      `watch entry ${index} nodeContains`,
    ),
    entity:
      value.entity === undefined
        ? undefined
        : parsePortableEntity(value.entity, `watch entry ${index}`),
  };
}

function parsePortableBuild(value: unknown, index: number): PortableBuild {
  if (
    !isRecord(value) ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    value.title.length > 160 ||
    !Array.isArray(value.equipment) ||
    !Array.isArray(value.enhancements)
  )
    throw new Error(`Profile build entry ${index} is invalid`);
  const slots = new Set<string>();
  const equipment = value.equipment.map((entry, equipmentIndex) => {
    const label = `build entry ${index} equipment ${equipmentIndex}`;
    if (
      !isRecord(entry) ||
      typeof entry.slot !== "string" ||
      !(BUILD_SLOTS as readonly string[]).includes(entry.slot) ||
      !Array.isArray(entry.mods) ||
      !Number.isSafeInteger(entry.formaCount) ||
      (entry.formaCount as number) < 0 ||
      (entry.formaCount as number) > 100 ||
      typeof entry.capacityUpgrade !== "boolean"
    )
      throw new Error(`Profile ${label} is invalid`);
    if (slots.has(entry.slot))
      throw new Error(
        `Profile build entry ${index} contains duplicate slot ${entry.slot}`,
      );
    slots.add(entry.slot);
    const positions = new Set<number>();
    const mods = entry.mods.map((mod, modIndex) => {
      if (
        !isRecord(mod) ||
        !Number.isSafeInteger(mod.position) ||
        (mod.position as number) < 0 ||
        (mod.position as number) > 19 ||
        (mod.rank !== undefined &&
          (!Number.isSafeInteger(mod.rank) ||
            (mod.rank as number) < 0 ||
            (mod.rank as number) > 100))
      )
        throw new Error(`Profile ${label} mod ${modIndex} is invalid`);
      if (positions.has(mod.position as number))
        throw new Error(
          `Profile ${label} contains duplicate mod position ${mod.position}`,
        );
      positions.add(mod.position as number);
      return {
        position: mod.position as number,
        rank: mod.rank as number | undefined,
        entity: parsePortableEntity(mod.entity, `${label} mod ${modIndex}`),
      };
    });
    return {
      slot: entry.slot as BuildSlot,
      entity: parsePortableEntity(entry.entity, label),
      notes: optionalText(entry.notes, 2_000, `${label} notes`),
      configuration: optionalText(
        entry.configuration,
        120,
        `${label} configuration`,
      ),
      formaCount: entry.formaCount as number,
      capacityUpgrade: entry.capacityUpgrade,
      mods,
    };
  });
  const enhancementSlots = new Set<string>();
  const enhancements = value.enhancements.map((entry, enhancementIndex) => {
    const label = `build entry ${index} enhancement ${enhancementIndex}`;
    if (
      !isRecord(entry) ||
      typeof entry.slot !== "string" ||
      !(BUILD_ENHANCEMENT_SLOTS as readonly string[]).includes(entry.slot) ||
      (entry.rank !== undefined &&
        (!Number.isSafeInteger(entry.rank) ||
          (entry.rank as number) < 0 ||
          (entry.rank as number) > 100))
    )
      throw new Error(`Profile ${label} is invalid`);
    if (enhancementSlots.has(entry.slot))
      throw new Error(
        `Profile build entry ${index} contains duplicate enhancement slot ${entry.slot}`,
      );
    enhancementSlots.add(entry.slot);
    const entity = parsePortableEntity(entry.entity, label);
    const optionKey = optionalText(entry.optionKey, 120, `${label} optionKey`);
    if (entity.kind === "shard" && !optionKey)
      throw new Error(`Profile ${label} requires an effect option`);
    if (entity.kind !== "shard" && optionKey)
      throw new Error(`Profile ${label} cannot contain an effect option`);
    return {
      slot: entry.slot as BuildEnhancementSlot,
      rank: entry.rank as number | undefined,
      optionKey,
      entity,
    };
  });
  return {
    title: value.title,
    category: optionalText(value.category, 80, `build entry ${index} category`),
    notes: optionalText(value.notes, 10_000, `build entry ${index} notes`),
    equipment,
    enhancements,
  };
}

function parsePortableEntity(
  value: unknown,
  label: string,
): PortableEntityReference {
  if (!isRecord(value) || !Array.isArray(value.externalIds))
    throw new Error(`Profile ${label} has an invalid entity`);
  for (const field of ["kind", "slug", "name"] as const)
    if (typeof value[field] !== "string" || !value[field])
      throw new Error(`Profile ${label} has invalid entity.${field}`);
  const externalIds = value.externalIds.map((identifier) => {
    if (
      !isRecord(identifier) ||
      typeof identifier.sourceId !== "string" ||
      !identifier.sourceId ||
      typeof identifier.namespace !== "string" ||
      !identifier.namespace ||
      typeof identifier.value !== "string" ||
      !identifier.value
    )
      throw new Error(`Profile ${label} has an invalid external ID`);
    return {
      sourceId: identifier.sourceId,
      namespace: identifier.namespace,
      value: identifier.value,
    };
  });
  return {
    externalIds,
    kind: value.kind as string,
    slug: value.slug as string,
    name: value.name as string,
  };
}

const WATCH_KINDS = ["cycle", "alert", "fissure", "event", "trader"] as const;
const WATCH_TRIGGERS = ["active", "starting", "ending"] as const;

function optionalText(
  value: unknown,
  maximum: number,
  label: string,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > maximum)
    throw new Error(
      `Profile ${label} must be a string of at most ${maximum} characters`,
    );
  return value;
}

function portableReferenceForCatalogEntity(
  sqlite: Database.Database,
  identifiers: Database.Statement,
  entity: { kind: string; slug: string; name: string },
): PortableEntityReference {
  const row = sqlite
    .prepare("select id from entities where kind = ? and slug = ?")
    .get(entity.kind, entity.slug) as { id: string } | undefined;
  if (!row)
    throw new Error(
      `Build references missing catalog entity ${entity.kind}:${entity.slug}`,
    );
  return {
    ...entity,
    externalIds: identifiers.all(
      row.id,
    ) as PortableEntityReference["externalIds"],
  };
}

function catalogReferenceById(
  sqlite: Database.Database,
  entityId: string,
): { kind: string; slug: string } {
  const entity = sqlite
    .prepare("select kind, slug from entities where id = ? and retired = 0")
    .get(entityId) as { kind: string; slug: string } | undefined;
  if (!entity) throw new Error(`Resolved entity ${entityId} is not active`);
  return entity;
}

function resolvePortableEntity(
  sqlite: Database.Database,
  entity: PortableEntityReference,
): { entityId?: string; reason?: "missing" | "ambiguous" } {
  const candidates = new Set<string>();
  const byExternalId = sqlite.prepare(
    "select entity_id as entityId from external_ids where source_id = ? and namespace = ? and value = ?",
  );
  for (const identifier of entity.externalIds) {
    const match = byExternalId.get(
      identifier.sourceId,
      identifier.namespace,
      identifier.value,
    ) as { entityId: string } | undefined;
    if (match) candidates.add(match.entityId);
  }
  if (!candidates.size) {
    const fallback = sqlite
      .prepare(
        "select id from entities where kind = ? and slug = ? and retired = 0",
      )
      .get(entity.kind, entity.slug) as { id: string } | undefined;
    if (fallback) candidates.add(fallback.id);
  }
  return candidates.size === 1
    ? { entityId: [...candidates][0]! }
    : { reason: candidates.size ? "ambiguous" : "missing" };
}

function validateInventoryValues(value: unknown): InventoryValues {
  if (!isRecord(value)) throw new Error("Inventory values must be an object");
  const counts = {} as Pick<
    InventoryValues,
    "ownedCount" | "builtCount" | "wantedCount"
  >;
  for (const field of ["ownedCount", "builtCount", "wantedCount"] as const) {
    const count = value[field];
    if (!Number.isSafeInteger(count) || (count as number) < 0)
      throw new Error(`${field} must be a non-negative safe integer`);
    counts[field] = count as number;
  }
  for (const field of ["mastered", "subsumed"] as const) {
    if (value[field] !== undefined && typeof value[field] !== "boolean")
      throw new Error(`${field} must be boolean when present`);
  }
  if (
    value.note !== undefined &&
    (typeof value.note !== "string" || value.note.length > 2_000)
  )
    throw new Error("note must be a string of at most 2000 characters");
  return {
    ...counts,
    mastered: value.mastered as boolean | undefined,
    subsumed: value.subsumed as boolean | undefined,
    note: value.note as string | undefined,
  };
}

function assertUserAndEntity(
  sqlite: Database.Database,
  userId: string,
  entityId: string,
): void {
  assertUser(sqlite, userId);
  if (!sqlite.prepare("select 1 from entities where id = ?").get(entityId))
    throw new Error(`Unknown entity ${entityId}`);
}

function assertUser(sqlite: Database.Database, userId: string): void {
  if (!sqlite.prepare("select 1 from users where id = ?").get(userId))
    throw new Error(`Unknown user ${userId}`);
}

function booleanToSql(value: boolean | undefined): number | null {
  return value === undefined ? null : value ? 1 : 0;
}

function sqlToBoolean(value: number | null): boolean | undefined {
  return value === null ? undefined : Boolean(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
