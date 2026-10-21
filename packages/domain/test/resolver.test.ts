import assert from "node:assert/strict";
import test from "node:test";
import {
  externalKey,
  normalizedAlias,
  resolveEntity,
  type CanonicalEntity,
  type EntityId,
  type EntityObservation,
  type ResolutionState,
} from "../src/index.ts";

const entityId = "weapon:braton" as EntityId;
const state: ResolutionState = {
  entities: new Map([
    [
      entityId,
      {
        id: entityId,
        kind: "weapon",
        name: "Braton",
        slug: "braton",
        retired: false,
      },
    ],
  ]),
  externalIds: new Map([
    [
      externalKey({
        sourceId: "wfcd",
        namespace: "uniqueName",
        value: "/Lotus/Braton",
      }),
      entityId,
    ],
  ]),
  aliases: new Map([[normalizedAlias("Braton"), [entityId]]]),
};
const base: EntityObservation = {
  type: "entity",
  kind: "weapon",
  externalIds: [],
  fields: { name: "Braton" },
  evidence: {
    sourceId: "wfcd",
    sourceRecordKey: "x",
    snapshotVersion: "1",
    retrievedAt: "2026-01-01T00:00:00Z",
  },
};

test("stable external IDs take precedence over names", () => {
  const result = resolveEntity(
    {
      ...base,
      fields: { name: "Renamed" },
      externalIds: [
        { sourceId: "wfcd", namespace: "uniqueName", value: "/Lotus/Braton" },
      ],
    },
    state,
  );
  assert.deepEqual(result, { status: "matched", entityId, by: "external-id" });
});

test("ambiguous aliases become reviewable conflicts", () => {
  const other = "weapon:mk1-braton" as EntityId;
  const entities = new Map(state.entities);
  entities.set(other, {
    id: other,
    kind: "weapon",
    name: "MK1-Braton",
    slug: "mk1-braton",
    retired: false,
  });
  const result = resolveEntity(base, {
    ...state,
    entities,
    externalIds: new Map(),
    aliases: new Map([[normalizedAlias("Braton"), [entityId, other]]]),
  });
  assert.equal(result.status, "conflict");
});

test("alias matching respects known kinds and only typed evidence refines unknowns", () => {
  const node = "node:lex" as EntityId;
  const unknown = "unknown:vitality" as EntityId;
  const entities = new Map(state.entities);
  entities.set(node, {
    id: node,
    kind: "node",
    name: "Lex",
    slug: "lex",
    retired: false,
  });
  entities.set(unknown, {
    id: unknown,
    kind: "unknown",
    name: "Vitality",
    slug: "vitality",
    retired: false,
  });
  const aliases = new Map([
    [normalizedAlias("Lex"), [node]],
    [normalizedAlias("Vitality"), [unknown]],
  ]);

  assert.deepEqual(
    resolveEntity(
      { ...base, fields: { name: "Lex" } },
      { entities, aliases, externalIds: new Map() },
    ),
    { status: "new" },
  );
  assert.deepEqual(
    resolveEntity(
      { ...base, kind: "unknown", fields: { name: "Lex" } },
      { entities, aliases, externalIds: new Map() },
    ),
    { status: "new" },
  );
  assert.deepEqual(
    resolveEntity(
      { ...base, kind: "mod", fields: { name: "Vitality" } },
      { entities, aliases, externalIds: new Map() },
    ),
    { status: "matched", entityId: unknown, by: "alias" },
  );
});

test("an exact kind alias outranks an unknown placeholder", () => {
  const placeholder = "unknown:jade" as EntityId;
  const warframe = "warframe:jade" as EntityId;
  const entities = new Map<EntityId, CanonicalEntity>([
    [
      placeholder,
      {
        id: placeholder,
        kind: "unknown",
        name: "Jade",
        slug: "jade-colour-picker",
        retired: false,
      },
    ],
    [
      warframe,
      {
        id: warframe,
        kind: "warframe",
        name: "Jade",
        slug: "jade",
        retired: false,
      },
    ],
  ]);

  assert.deepEqual(
    resolveEntity(
      { ...base, kind: "warframe", fields: { name: "Jade" } },
      {
        entities,
        aliases: new Map([[normalizedAlias("Jade"), [placeholder, warframe]]]),
        externalIds: new Map(),
      },
    ),
    { status: "matched", entityId: warframe, by: "alias" },
  );
});

test("boss observations refine enemies while enemy observations retain bosses", () => {
  const enemy = "enemy:jackal" as EntityId;
  const entities = new Map<EntityId, CanonicalEntity>([
    [
      enemy,
      {
        id: enemy,
        kind: "enemy",
        name: "Jackal",
        slug: "jackal",
        retired: false,
      },
    ],
  ]);
  const aliases = new Map([[normalizedAlias("Jackal"), [enemy]]]);
  assert.deepEqual(
    resolveEntity(
      { ...base, kind: "boss", fields: { name: "Jackal" } },
      { entities, aliases, externalIds: new Map() },
    ),
    { status: "matched", entityId: enemy, by: "alias" },
  );
  entities.set(enemy, { ...entities.get(enemy)!, kind: "boss" });
  assert.deepEqual(
    resolveEntity(
      { ...base, kind: "enemy", fields: { name: "Jackal" } },
      { entities, aliases, externalIds: new Map() },
    ),
    { status: "matched", entityId: enemy, by: "alias" },
  );
});
