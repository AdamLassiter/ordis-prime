import fs from "node:fs/promises";
import { parse } from "yaml";
import {
  RELATION_KINDS,
  type EntityKind,
  type ExternalIdentifier,
  type Observation,
  type RelationKind,
} from "@ordis-prime/domain";
import {
  contentHash,
  type FetchContext,
  type Snapshot,
  type SourceAdapter,
  type SourceDescriptor,
} from "../adapter.ts";

const DISCOVERY_ENTITY_KINDS = [
  "quest",
  "mechanic",
  "secret",
  "enemy",
  "boss",
  "node",
] as const satisfies readonly EntityKind[];

interface ManualDiscoveryDocument {
  schemaVersion: 1;
  source: {
    id: string;
    title: string;
    url: string;
    licenseNote: string;
    priority?: number;
  };
  entries: Array<{
    key: string;
    kind: (typeof DISCOVERY_ENTITY_KINDS)[number];
    name: string;
    slug: string;
    description?: string;
    aliases?: string[];
    citationUrl?: string;
  }>;
  relations: Array<{
    from: EntityReference;
    to: EntityReference;
    kind: RelationKind;
    notes?: string;
    citationUrl?: string;
  }>;
}

type EntityReference = string | ExternalIdentifier;

export class ManualDiscoveryAdapter implements SourceAdapter {
  readonly source: SourceDescriptor;
  private readonly filePath?: string;
  private readonly providedBytes?: Uint8Array;
  private constructor(
    document: ManualDiscoveryDocument,
    filePath?: string,
    providedBytes?: Uint8Array,
  ) {
    this.filePath = filePath;
    this.providedBytes = providedBytes;
    this.source = {
      id: document.source.id,
      name: document.source.title,
      homepage: document.source.url,
      license: document.source.licenseNote,
      priority: document.source.priority ?? 200,
    };
  }

  static async fromFile(filePath: string): Promise<ManualDiscoveryAdapter> {
    const bytes = await fs.readFile(filePath);
    return new ManualDiscoveryAdapter(parseDocument(bytes), filePath);
  }
  static fromBytes(bytes: Uint8Array): ManualDiscoveryAdapter {
    return new ManualDiscoveryAdapter(
      parseDocument(bytes),
      undefined,
      bytes.slice(),
    );
  }

  async fetch(_context: FetchContext): Promise<Snapshot> {
    const bytes =
      this.providedBytes?.slice() ??
      new Uint8Array(await fs.readFile(this.filePath!));
    const hash = contentHash(bytes);
    return {
      sourceId: this.source.id,
      version: hash,
      retrievedAt: new Date().toISOString(),
      contentHash: hash,
      mediaType: "application/yaml",
      bytes,
    };
  }

  async *parse(snapshot: Snapshot): AsyncIterable<Observation> {
    const document = parseDocument(snapshot.bytes);
    if (document.source.id !== this.source.id)
      throw new Error(
        "Manual source ID changed between adapter creation and fetch",
      );
    const evidence = (
      sourceRecordKey: string,
      path: string,
      citationUrl?: string,
    ) => ({
      sourceId: this.source.id,
      sourceRecordKey,
      snapshotVersion: snapshot.version,
      retrievedAt: snapshot.retrievedAt,
      citationUrl: citationUrl ?? document.source.url,
      license: document.source.licenseNote,
      path,
    });
    for (const [index, entry] of document.entries.entries()) {
      yield {
        type: "entity",
        kind: entry.kind,
        externalIds: [localReference(this.source.id, entry.key)],
        fields: {
          name: entry.name,
          slug: entry.slug,
          description: entry.description,
        },
        aliases: entry.aliases,
        evidence: evidence(entry.key, `entries[${index}]`, entry.citationUrl),
      };
    }
    for (const [index, relation] of document.relations.entries()) {
      yield {
        type: "entity-relation",
        kind: relation.kind,
        fromExternalId: resolveReference(this.source.id, relation.from),
        toExternalId: resolveReference(this.source.id, relation.to),
        notes: relation.notes,
        evidence: evidence(
          `relation:${index}`,
          `relations[${index}]`,
          relation.citationUrl,
        ),
      };
    }
  }
}

function parseDocument(bytes: Uint8Array): ManualDiscoveryDocument {
  const value = parse(new TextDecoder().decode(bytes)) as unknown;
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.source))
    throw new Error(
      "Manual discovery must use schemaVersion 1 and include source metadata",
    );
  for (const field of ["id", "title", "url", "licenseNote"] as const)
    if (typeof value.source[field] !== "string" || !value.source[field])
      throw new Error(`Manual discovery source.${field} is required`);
  if (
    value.source.priority !== undefined &&
    (!Number.isInteger(value.source.priority) ||
      (value.source.priority as number) < 0)
  )
    throw new Error(
      "Manual discovery source.priority must be a non-negative integer",
    );
  if (!Array.isArray(value.entries) || !value.entries.length)
    throw new Error("Manual discovery must contain entries");
  const keys = new Set<string>();
  const entries = value.entries.map((entry, index) => {
    if (!isRecord(entry))
      throw new Error(`Manual discovery entry ${index} is invalid`);
    for (const field of ["key", "kind", "name", "slug"] as const)
      if (typeof entry[field] !== "string" || !entry[field])
        throw new Error(`Manual discovery entry ${index}.${field} is required`);
    if (
      !(DISCOVERY_ENTITY_KINDS as readonly string[]).includes(
        entry.kind as string,
      )
    )
      throw new Error(
        `Manual discovery entry ${index} has unsupported kind ${entry.kind}`,
      );
    if (keys.has(entry.key as string))
      throw new Error(`Manual discovery contains duplicate key ${entry.key}`);
    keys.add(entry.key as string);
    for (const field of ["description", "citationUrl"] as const)
      if (entry[field] !== undefined && typeof entry[field] !== "string")
        throw new Error(
          `Manual discovery entry ${index}.${field} must be a string`,
        );
    if (
      entry.aliases !== undefined &&
      (!Array.isArray(entry.aliases) ||
        entry.aliases.some((alias) => typeof alias !== "string" || !alias))
    )
      throw new Error(
        `Manual discovery entry ${index}.aliases must contain strings`,
      );
    return entry as unknown as ManualDiscoveryDocument["entries"][number];
  });
  const relationsValue = value.relations ?? [];
  if (!Array.isArray(relationsValue))
    throw new Error("Manual discovery relations must be an array");
  const relations = relationsValue.map((relation, index) => {
    if (
      !isRecord(relation) ||
      !isReference(relation.from) ||
      !isReference(relation.to) ||
      typeof relation.kind !== "string" ||
      !(RELATION_KINDS as readonly string[]).includes(relation.kind)
    )
      throw new Error(`Manual discovery relation ${index} is invalid`);
    for (const ref of [relation.from, relation.to])
      if (typeof ref === "string" && !keys.has(ref))
        throw new Error(
          `Manual discovery relation ${index} refers to unknown local key ${ref}`,
        );
    for (const field of ["notes", "citationUrl"] as const)
      if (relation[field] !== undefined && typeof relation[field] !== "string")
        throw new Error(
          `Manual discovery relation ${index}.${field} must be a string`,
        );
    return relation as unknown as ManualDiscoveryDocument["relations"][number];
  });
  return {
    schemaVersion: 1,
    source: value.source as unknown as ManualDiscoveryDocument["source"],
    entries,
    relations,
  };
}

function localReference(sourceId: string, value: string): ExternalIdentifier {
  return { sourceId, namespace: "key", value };
}

function resolveReference(
  sourceId: string,
  reference: EntityReference,
): ExternalIdentifier {
  return typeof reference === "string"
    ? localReference(sourceId, reference)
    : reference;
}

function isReference(value: unknown): value is EntityReference {
  return (
    (typeof value === "string" && Boolean(value)) ||
    (isRecord(value) &&
      ["sourceId", "namespace", "value"].every(
        (field) => typeof value[field] === "string" && Boolean(value[field]),
      ))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
