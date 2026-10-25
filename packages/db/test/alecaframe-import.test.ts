import assert from "node:assert/strict";
import { createCipheriv } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyWarframeUpdaterImport,
  applyAlecaFrameImport,
  applyWarframeApiHelperImport,
  cancelPlayerImportPairing,
  createPlayerImportPairing,
  createLocalUser,
  decryptAlecaFrameSnapshot,
  findPlayerInventoryEntry,
  getPlayerBuild,
  getPlayerImportPairing,
  getPlayerSettings,
  listPlayerImportDevices,
  migrateDatabase,
  openSqliteDatabase,
  previewAlecaFrameImport,
  prunePlayerImportPairings,
  registerWarframeUpdaterDevice,
  revokePlayerImportDevice,
  setInventoryEntry,
} from "../src/index.ts";

const KEY = Buffer.from("LEO-ALEC\tEO-ALEC", "utf8");
const IV = Buffer.from([
  49, 50, 70, 71, 66, 51, 54, 45, 76, 69, 51, 45, 113, 61, 57, 0,
]);

test("AlecaFrame AES snapshots decode flat and InventoryJson-wrapped objects", () => {
  const flat = { Suits: [], PlayerLevel: 22 };
  assert.deepEqual(decryptAlecaFrameSnapshot(encrypt(flat)), flat);
  assert.deepEqual(
    decryptAlecaFrameSnapshot(
      encrypt({
        LastInventorySync: "2026-10-24T12:00:00.000Z",
        InventoryJson: JSON.stringify({ Suits: [], PlayerLevel: 23 }),
      }),
    ),
    {
      LastInventorySync: "2026-10-24T12:00:00.000Z",
      Suits: [],
      PlayerLevel: 23,
    },
  );
  assert.throws(
    () => decryptAlecaFrameSnapshot(new Uint8Array([1, 2, 3])),
    /not valid AES-CBC ciphertext/,
  );
  assert.throws(
    () => decryptAlecaFrameSnapshot(new Uint8Array(16)),
    /could not be decrypted/,
  );
  assert.throws(
    () =>
      decryptAlecaFrameSnapshot(encrypt({ InventoryJson: "{not valid JSON" })),
    /InventoryJson is not valid JSON/,
  );
});

test("AlecaFrame previews are read-only and merge verified inventory, progression, and loadouts", async (context) => {
  const fixture = await createFixture(context);
  const snapshot = encrypt(snapshotDocument());
  const options = {
    mode: "merge" as const,
    includeInventory: true,
    includeProgression: true,
    createBuild: true,
    buildTitle: "Imported active loadout",
  };
  const preview = previewAlecaFrameImport(
    fixture.database,
    fixture.userId,
    snapshot,
    options,
  );
  assert.equal(preview.inventory.resolvedItems, 4);
  assert.equal(preview.inventory.unresolvedCount, 1);
  assert.equal(preview.progression.masteryRank?.after, 25);
  assert.equal(preview.progression.highestWarframeRank?.after, 30);
  assert.deepEqual(
    preview.loadout.equipment.map(({ slot, name, mods }) => ({
      slot,
      name,
      mods,
    })),
    [
      { slot: "warframe", name: "Excalibur", mods: 1 },
      { slot: "primary", name: "Braton", mods: 1 },
    ],
  );
  assert.equal(
    findPlayerInventoryEntry(
      fixture.database,
      fixture.userId,
      "resource",
      "ferrite",
    )?.ownedCount,
    200,
    "preview must not mutate inventory",
  );
  assert.deepEqual(getPlayerSettings(fixture.database, fixture.userId), {
    masteryRank: undefined,
    railjackIntrinsicRank: undefined,
    highestWarframeRank: undefined,
    activeAdversary: undefined,
  });

  const applied = applyAlecaFrameImport(
    fixture.database,
    fixture.userId,
    snapshot,
    preview.snapshotHash,
    options,
  );
  assert.ok(applied.buildId);
  assert.equal(
    findPlayerInventoryEntry(
      fixture.database,
      fixture.userId,
      "resource",
      "ferrite",
    )?.ownedCount,
    200,
    "merge must not lower an existing count",
  );
  const frame = findPlayerInventoryEntry(
    fixture.database,
    fixture.userId,
    "warframe",
    "excalibur",
  );
  assert.equal(frame?.builtCount, 1);
  assert.equal(frame?.mastered, true);
  assert.deepEqual(getPlayerSettings(fixture.database, fixture.userId), {
    masteryRank: 25,
    highestWarframeRank: 30,
    railjackIntrinsicRank: undefined,
    activeAdversary: undefined,
  });
  const build = getPlayerBuild(
    fixture.database,
    fixture.userId,
    applied.buildId!,
  );
  assert.equal(build?.title, "Imported active loadout");
  assert.equal(build?.equipment.length, 2);
  assert.equal(
    build?.equipment.find(({ slot }) => slot === "warframe")?.mods[0]?.rank,
    8,
  );
  assert.equal(
    build?.equipment.find(({ slot }) => slot === "warframe")?.formaCount,
    2,
  );
});

test("AlecaFrame replacement previews decreases and preserves wanted counts and notes", async (context) => {
  const fixture = await createFixture(context);
  const snapshot = encrypt(snapshotDocument());
  const options = {
    mode: "replace" as const,
    includeInventory: true,
    includeProgression: false,
    createBuild: false,
  };
  const preview = previewAlecaFrameImport(
    fixture.database,
    fixture.userId,
    snapshot,
    options,
  );
  assert.ok(preview.inventory.decreasedItems >= 2);
  const applied = applyAlecaFrameImport(
    fixture.database,
    fixture.userId,
    snapshot,
    preview.snapshotHash,
    options,
  );
  assert.equal(applied.buildId, undefined);
  const ferrite = findPlayerInventoryEntry(
    fixture.database,
    fixture.userId,
    "resource",
    "ferrite",
  );
  assert.equal(ferrite?.ownedCount, 120);
  assert.equal(ferrite?.wantedCount, 4);
  assert.equal(ferrite?.note, "Keep this note");
  const old = findPlayerInventoryEntry(
    fixture.database,
    fixture.userId,
    "resource",
    "old-resource",
  );
  assert.equal(old?.ownedCount, 0);
  assert.equal(old?.wantedCount, 2);
  assert.equal(old?.note, "Manual reminder");
  assert.throws(
    () =>
      applyAlecaFrameImport(
        fixture.database,
        fixture.userId,
        snapshot,
        "0".repeat(64),
        options,
      ),
    /changed after preview/,
  );
});

test("AlecaFrame apply rolls every player-state change back when build validation fails", async (context) => {
  const fixture = await createFixture(context);
  const snapshot = encrypt(snapshotDocument());
  const options = {
    mode: "replace" as const,
    includeInventory: true,
    includeProgression: true,
    createBuild: true,
  };
  const preview = previewAlecaFrameImport(
    fixture.database,
    fixture.userId,
    snapshot,
    options,
  );
  fixture.database
    .prepare(
      "update entities set weapon_class = 'secondary' where id = 'rifle'",
    )
    .run();
  assert.throws(
    () =>
      applyAlecaFrameImport(
        fixture.database,
        fixture.userId,
        snapshot,
        preview.snapshotHash,
        options,
      ),
    /not compatible with primary/,
  );
  assert.equal(
    findPlayerInventoryEntry(
      fixture.database,
      fixture.userId,
      "resource",
      "ferrite",
    )?.ownedCount,
    200,
  );
  assert.equal(
    getPlayerSettings(fixture.database, fixture.userId).masteryRank,
    undefined,
  );
  assert.deepEqual(
    fixture.database
      .prepare("select count(*) as count from player_builds where user_id = ?")
      .get(fixture.userId),
    { count: 0 },
  );
});

test("Warframe API helper JSON applies only a monotonic inventory and progression merge", async (context) => {
  const fixture = await createFixture(context);
  const bytes = new TextEncoder().encode(JSON.stringify(snapshotDocument()));

  const result = applyWarframeApiHelperImport(
    fixture.database,
    fixture.userId,
    bytes,
  );

  assert.equal(result.applied, true);
  assert.equal(result.buildId, undefined);
  assert.equal(
    findPlayerInventoryEntry(
      fixture.database,
      fixture.userId,
      "resource",
      "ferrite",
    )?.ownedCount,
    200,
    "live synchronization must not lower a manual count",
  );
  assert.equal(
    findPlayerInventoryEntry(
      fixture.database,
      fixture.userId,
      "warframe",
      "excalibur",
    )?.mastered,
    true,
  );
  assert.equal(
    getPlayerSettings(fixture.database, fixture.userId).masteryRank,
    25,
  );
  assert.deepEqual(
    fixture.database
      .prepare("select count(*) as count from player_builds where user_id = ?")
      .get(fixture.userId),
    { count: 0 },
  );
});

test("Warframe API helper accepts legitimate resource counts above one million", async (context) => {
  const fixture = await createFixture(context);
  const count = 1_371_338;
  const result = applyWarframeApiHelperImport(
    fixture.database,
    fixture.userId,
    new TextEncoder().encode(
      JSON.stringify({
        MiscItems: [
          {
            ItemType: "/Lotus/Types/Items/MiscItems/Ferrite",
            ItemCount: count,
          },
        ],
      }),
    ),
  );

  assert.equal(result.inventory.changedItems, 1);
  assert.equal(
    findPlayerInventoryEntry(
      fixture.database,
      fixture.userId,
      "resource",
      "ferrite",
    )?.ownedCount,
    count,
  );
  assert.throws(
    () =>
      applyWarframeApiHelperImport(
        fixture.database,
        fixture.userId,
        new TextEncoder().encode(
          JSON.stringify({
            MiscItems: [
              {
                ItemType: "/Lotus/Types/Items/MiscItems/Ferrite",
                ItemCount: Number.MAX_SAFE_INTEGER + 1,
              },
            ],
          }),
        ),
      ),
    /Warframe API helper MiscItems\[0\]\.ItemCount is invalid/,
  );
});

test("updater pairing exchanges for a hashed rotating device credential", async (context) => {
  const fixture = await createFixture(context);
  const now = 1_800_000_000_000;
  const pairing = createPlayerImportPairing(
    fixture.database,
    fixture.userId,
    "https://ordis.example.test/path",
    now,
  );
  const token = pairing.pairingCode.split(":").at(-1)!;
  const stored = fixture.database
    .prepare(
      "select token_hash as tokenHash, status from player_import_pairings where id = ?",
    )
    .get(pairing.id) as { tokenHash: string; status: string };
  assert.notEqual(stored.tokenHash, token);
  assert.equal(stored.tokenHash.length, 64);
  const nextToken = "B".repeat(43);
  const requestId = "11111111-1111-4111-8111-111111111111";
  const bytes = new TextEncoder().encode(JSON.stringify(snapshotDocument()));
  const imported = applyWarframeUpdaterImport(fixture.database, {
    token,
    nextToken,
    requestId,
    deviceName: "Gaming PC",
    bytes,
    now: now + 1,
  });
  assert.equal(imported.paired, true);
  assert.equal(
    getPlayerImportPairing(
      fixture.database,
      fixture.userId,
      pairing.id,
      now + 2,
    )?.status,
    "succeeded",
  );
  assert.throws(
    () =>
      applyWarframeUpdaterImport(fixture.database, {
        token,
        nextToken: "C".repeat(43),
        requestId: "22222222-2222-4222-8222-222222222222",
        deviceName: "Replay",
        bytes,
        now: now + 2,
      }),
    /expired or already used/,
  );
  const [device] = listPlayerImportDevices(fixture.database, fixture.userId);
  assert.equal(device?.name, "Gaming PC");
  const storedDevice = fixture.database
    .prepare(
      "select token_hash as tokenHash from player_import_devices where id = ?",
    )
    .get(imported.deviceId) as { tokenHash: string };
  assert.notEqual(storedDevice.tokenHash, nextToken);
  assert.equal(storedDevice.tokenHash.length, 64);

  const rotatedToken = "C".repeat(43);
  const rotationRequestId = "33333333-3333-4333-8333-333333333333";
  assert.equal(
    applyWarframeUpdaterImport(fixture.database, {
      token: nextToken,
      nextToken: rotatedToken,
      requestId: rotationRequestId,
      deviceId: imported.deviceId,
      bytes,
      now: now + 2,
    }).replayed,
    false,
  );
  assert.equal(
    applyWarframeUpdaterImport(fixture.database, {
      token: nextToken,
      nextToken: rotatedToken,
      requestId: rotationRequestId,
      deviceId: imported.deviceId,
      bytes,
      now: now + 3,
    }).replayed,
    true,
  );
  assert.deepEqual(
    fixture.database
      .prepare(
        "select count(*) as count from player_import_device_events where device_id = ?",
      )
      .get(imported.deviceId),
    { count: 3 },
  );
  assert.equal(
    revokePlayerImportDevice(
      fixture.database,
      fixture.userId,
      imported.deviceId,
      now + 4,
    ),
    true,
  );
  assert.throws(
    () =>
      applyWarframeUpdaterImport(fixture.database, {
        token: rotatedToken,
        nextToken: "D".repeat(43),
        requestId: "44444444-4444-4444-8444-444444444444",
        deviceId: imported.deviceId,
        bytes,
        now: now + 5,
      }),
    /revoked or unknown/,
  );
});

test("updater registration does not require Warframe inventory", async (context) => {
  const fixture = await createFixture(context);
  const now = 1_800_000_000_000;
  const pairing = createPlayerImportPairing(
    fixture.database,
    fixture.userId,
    "https://ordis.example.test",
    now,
  );
  const token = pairing.pairingCode.split(":").at(-1)!;
  const deviceToken = "R".repeat(43);
  const registered = registerWarframeUpdaterDevice(fixture.database, {
    token,
    deviceToken,
    deviceName: "Waiting PC",
    now: now + 1,
  });

  assert.equal(
    getPlayerImportPairing(
      fixture.database,
      fixture.userId,
      pairing.id,
      now + 2,
    )?.status,
    "succeeded",
  );
  assert.deepEqual(listPlayerImportDevices(fixture.database, fixture.userId), [
    {
      id: registered.deviceId,
      name: "Waiting PC",
      status: "active",
      createdAt: now + 1,
    },
  ]);

  const nextToken = "S".repeat(43);
  const synced = applyWarframeUpdaterImport(fixture.database, {
    token: deviceToken,
    nextToken,
    requestId: "77777777-7777-4777-8777-777777777777",
    deviceId: registered.deviceId,
    bytes: new TextEncoder().encode(JSON.stringify(snapshotDocument())),
    now: now + 60_000,
  });
  assert.equal(synced.paired, false);
  assert.equal(synced.result.applied, true);
});

test("expired and cancelled updater pairings cannot create devices", async (context) => {
  const fixture = await createFixture(context);
  const now = 1_800_000_000_000;
  const expired = createPlayerImportPairing(
    fixture.database,
    fixture.userId,
    "https://ordis.example.test",
    now,
  );
  const expiredToken = expired.pairingCode.split(":").at(-1)!;
  assert.throws(
    () =>
      applyWarframeUpdaterImport(fixture.database, {
        token: expiredToken,
        nextToken: "E".repeat(43),
        requestId: "55555555-5555-4555-8555-555555555555",
        deviceName: "Expired",
        bytes: new Uint8Array([123, 125]),
        now: expired.expiresAt,
      }),
    /expired or already used/,
  );
  const cancelled = createPlayerImportPairing(
    fixture.database,
    fixture.userId,
    "https://ordis.example.test",
    now,
  );
  assert.equal(
    cancelPlayerImportPairing(
      fixture.database,
      fixture.userId,
      cancelled.id,
      now + 1,
    ),
    true,
  );
  assert.equal(
    getPlayerImportPairing(
      fixture.database,
      fixture.userId,
      cancelled.id,
      now + 2,
    )?.status,
    "cancelled",
  );
  assert.equal(
    prunePlayerImportPairings(fixture.database, now + 24 * 60 * 60_000 + 2),
    2,
  );
});

test("invalid updater payloads fail closed and consume their pairing", async (context) => {
  const fixture = await createFixture(context);
  const now = 1_800_000_000_000;
  const pairing = createPlayerImportPairing(
    fixture.database,
    fixture.userId,
    "https://ordis.example.test",
    now,
  );
  const token = pairing.pairingCode.split(":").at(-1)!;
  const request = {
    token,
    nextToken: "F".repeat(43),
    requestId: "66666666-6666-4666-8666-666666666666",
    deviceName: "Invalid payload",
    bytes: new TextEncoder().encode("{not json"),
    now: now + 1,
  };
  assert.throws(
    () => applyWarframeUpdaterImport(fixture.database, request),
    /valid UTF-8 JSON/,
  );
  const failed = getPlayerImportPairing(
    fixture.database,
    fixture.userId,
    pairing.id,
    now + 2,
  );
  assert.equal(failed?.status, "failed");
  assert.match(failed?.error ?? "", /valid UTF-8 JSON/);
  assert.throws(
    () =>
      applyWarframeUpdaterImport(fixture.database, {
        ...request,
        bytes: new TextEncoder().encode(JSON.stringify(snapshotDocument())),
        now: now + 2,
      }),
    /expired or already used/,
  );
});

test("updater devices enforce request limits and cap audit history", async (context) => {
  const fixture = await createFixture(context);
  const now = 1_800_000_000_000;
  const pairing = createPlayerImportPairing(
    fixture.database,
    fixture.userId,
    "https://ordis.example.test",
    now,
  );
  const pairingToken = pairing.pairingCode.split(":").at(-1)!;
  const bytes = new TextEncoder().encode(JSON.stringify(snapshotDocument()));
  let currentToken = updaterToken(0);
  const paired = applyWarframeUpdaterImport(fixture.database, {
    token: pairingToken,
    nextToken: currentToken,
    requestId: updaterRequestId(0),
    deviceName: "Rate limited PC",
    bytes,
    now: now + 1,
  });
  for (let index = 1; index < 12; index += 1) {
    const nextToken = updaterToken(index);
    applyWarframeUpdaterImport(fixture.database, {
      token: currentToken,
      nextToken,
      requestId: updaterRequestId(index),
      deviceId: paired.deviceId,
      bytes,
      now: now + index + 1,
    });
    currentToken = nextToken;
  }
  assert.throws(
    () =>
      applyWarframeUpdaterImport(fixture.database, {
        token: currentToken,
        nextToken: updaterToken(12),
        requestId: updaterRequestId(12),
        deviceId: paired.deviceId,
        bytes,
        now: now + 20,
      }),
    /rate limit/,
  );
  assert.match(
    listPlayerImportDevices(fixture.database, fixture.userId)[0]?.lastError ??
      "",
    /rate limit/,
  );
  for (let index = 13; index < 114; index += 1) {
    const nextToken = updaterToken(index);
    applyWarframeUpdaterImport(fixture.database, {
      token: currentToken,
      nextToken,
      requestId: updaterRequestId(index),
      deviceId: paired.deviceId,
      bytes,
      now: now + index * 60 * 60_000,
    });
    currentToken = nextToken;
  }
  assert.deepEqual(
    fixture.database
      .prepare(
        "select count(*) as count from player_import_device_events where device_id = ?",
      )
      .get(paired.deviceId),
    { count: 100 },
  );
  assert.equal(
    listPlayerImportDevices(fixture.database, fixture.userId)[0]?.lastError,
    undefined,
  );

  for (let index = 0; index < 4; index += 1)
    createPlayerImportPairing(
      fixture.database,
      fixture.userId,
      "https://ordis.example.test",
      now + 100 + index,
    );
  assert.throws(
    () =>
      createPlayerImportPairing(
        fixture.database,
        fixture.userId,
        "https://ordis.example.test",
        now + 200,
      ),
    /Too many updater pairings/,
  );
});

function updaterToken(index: number): string {
  return index.toString(36).padStart(3, "0") + "A".repeat(40);
}

function updaterRequestId(index: number): string {
  return `${index.toString(16).padStart(8, "0")}-1234-4234-8234-${index
    .toString(16)
    .padStart(12, "0")}`;
}

async function createFixture(context: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-alecaframe-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "alecaframe.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  const userId = createLocalUser(database, { username: "Tenno" });
  database
    .prepare(
      "insert into sources (id, name, homepage, priority, enabled) values ('wfcd-items', 'WFCD', 'https://example.test', 100, 1)",
    )
    .run();
  seedEntity(database, {
    id: "frame",
    kind: "warframe",
    name: "Excalibur",
    slug: "excalibur",
    maxRank: 30,
    path: "/Lotus/Powersuits/Excalibur/Excalibur",
  });
  seedEntity(database, {
    id: "rifle",
    kind: "weapon",
    name: "Braton",
    slug: "braton",
    maxRank: 30,
    weaponClass: "primary",
    path: "/Lotus/Weapons/Tenno/Rifle/Braton",
  });
  seedEntity(database, {
    id: "mod",
    kind: "mod",
    name: "Vitality",
    slug: "vitality",
    modMaxRank: 10,
    path: "/Lotus/Upgrades/Mods/Warframe/AvatarHealthMaxMod",
  });
  seedEntity(database, {
    id: "ferrite",
    kind: "resource",
    name: "Ferrite",
    slug: "ferrite",
    path: "/Lotus/Types/Items/MiscItems/Ferrite",
  });
  seedEntity(database, {
    id: "old",
    kind: "resource",
    name: "Old Resource",
    slug: "old-resource",
    path: "/Lotus/Types/Items/MiscItems/OldResource",
  });
  setInventoryEntry(database, userId, "ferrite", {
    ownedCount: 200,
    builtCount: 0,
    wantedCount: 4,
    note: "Keep this note",
  });
  setInventoryEntry(database, userId, "old", {
    ownedCount: 9,
    builtCount: 0,
    wantedCount: 2,
    mastered: true,
    note: "Manual reminder",
  });
  return { database, userId };
}

function snapshotDocument() {
  return {
    LastInventorySync: "2026-10-24T12:00:00.000Z",
    PlayerLevel: 25,
    LoadOutPresets: {
      NORMAL: [
        {
          s: { ItemId: { $oid: "frame-copy" }, mod: 0 },
          l: { ItemId: { $oid: "rifle-copy" }, mod: 0 },
        },
      ],
    },
    Suits: [
      {
        ItemId: { $oid: "frame-copy" },
        ItemType: "/Lotus/Powersuits/Excalibur/Excalibur",
        XP: 900_000,
        Polarized: 2,
        Polarity: [{ Slot: 0, Value: "AP_DEFENSE" }],
        Configs: [{ Upgrades: ["mod-copy"] }],
      },
    ],
    LongGuns: [
      {
        ItemId: { $oid: "rifle-copy" },
        ItemType: "/Lotus/Weapons/Tenno/Rifle/Braton",
        XP: 0,
        Configs: [{ Upgrades: ["mod-copy"] }],
      },
    ],
    MiscItems: [
      {
        ItemType: "/Lotus/Types/Items/MiscItems/Ferrite",
        ItemCount: 120,
      },
      {
        ItemType: "/Lotus/Types/Items/MiscItems/Unknown",
        ItemCount: 1,
      },
    ],
    RawUpgrades: [],
    Upgrades: [
      {
        ItemId: { $oid: "mod-copy" },
        ItemType: "/Lotus/Upgrades/Mods/Warframe/AvatarHealthMaxMod",
        UpgradeFingerprint: '{"lvl":8}',
      },
    ],
    XPInfo: [
      {
        ItemType: "/Lotus/Powersuits/Excalibur/Excalibur",
        XP: 900_000,
      },
    ],
  };
}

function seedEntity(
  database: ReturnType<typeof openSqliteDatabase>,
  input: {
    id: string;
    kind: string;
    name: string;
    slug: string;
    path: string;
    maxRank?: number;
    modMaxRank?: number;
    weaponClass?: string;
  },
) {
  database
    .prepare(
      `insert into entities
         (id, kind, name, slug, equipment_max_rank, mod_max_rank, weapon_class, retired, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    )
    .run(
      input.id,
      input.kind,
      input.name,
      input.slug,
      input.maxRank ?? null,
      input.modMaxRank ?? null,
      input.weaponClass ?? null,
      Date.now(),
    );
  database
    .prepare(
      "insert into external_ids (entity_id, source_id, namespace, value) values (?, 'wfcd-items', 'uniqueName', ?)",
    )
    .run(input.id, input.path);
}

function encrypt(value: unknown) {
  const cipher = createCipheriv("aes-128-cbc", KEY, IV);
  return Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(value), "utf8")),
    cipher.final(),
  ]);
}
