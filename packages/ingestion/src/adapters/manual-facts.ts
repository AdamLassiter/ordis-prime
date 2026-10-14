import fs from "node:fs/promises";
import { parse } from "yaml";
import type { EntityKind, ExternalIdentifier, Observation } from "@ordis-prime/domain";
import { contentHash, type FetchContext, type Snapshot, type SourceAdapter, type SourceDescriptor } from "../adapter.ts";

const ENTITY_KINDS = ["unknown", "warframe", "weapon", "companion", "mod", "arcane", "shard", "resource", "relic", "blueprint", "component", "node", "planet", "quest", "enemy", "boss", "mechanic", "secret"] as const satisfies readonly EntityKind[];

interface ManualFactsDocument {
  schemaVersion: 1;
  source: { id: string; title: string; url: string; licenseNote: string; priority?: number };
  entries: Array<{
    target: ExternalIdentifier;
    kind: EntityKind;
    name?: string;
    slug?: string;
    description?: string;
    aliases?: string[];
    retired?: boolean;
    citationUrl?: string;
  }>;
}

export class ManualFactsAdapter implements SourceAdapter {
  readonly source: SourceDescriptor;
  private readonly filePath: string;

  private constructor(filePath: string, document: ManualFactsDocument) {
    this.filePath = filePath;
    this.source = { id: document.source.id, name: document.source.title, homepage: document.source.url, license: document.source.licenseNote, priority: document.source.priority ?? 300 };
  }

  static async fromFile(filePath: string): Promise<ManualFactsAdapter> {
    const bytes = await fs.readFile(filePath);
    return new ManualFactsAdapter(filePath, parseDocument(bytes));
  }

  async fetch(_context: FetchContext): Promise<Snapshot> {
    const bytes = new Uint8Array(await fs.readFile(this.filePath));
    const hash = contentHash(bytes);
    return { sourceId: this.source.id, version: hash, retrievedAt: new Date().toISOString(), contentHash: hash, mediaType: "application/yaml", bytes };
  }

  async *parse(snapshot: Snapshot): AsyncIterable<Observation> {
    const document = parseDocument(snapshot.bytes);
    if (document.source.id !== this.source.id) throw new Error("Manual source ID changed between adapter creation and fetch");
    for (const [index, entry] of document.entries.entries()) {
      yield {
        type: "entity", kind: entry.kind, externalIds: [entry.target],
        fields: { name: entry.name, slug: entry.slug, description: entry.description }, aliases: entry.aliases, tombstone: entry.retired,
        evidence: {
          sourceId: this.source.id, sourceRecordKey: `${entry.target.sourceId}:${entry.target.namespace}:${entry.target.value}`,
          snapshotVersion: snapshot.version, retrievedAt: snapshot.retrievedAt,
          citationUrl: entry.citationUrl ?? document.source.url, license: document.source.licenseNote, path: `entries[${index}]`,
        },
      };
    }
  }
}

function parseDocument(bytes: Uint8Array): ManualFactsDocument {
  const value = parse(new TextDecoder().decode(bytes)) as unknown;
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.source)) throw new Error("Manual facts must use schemaVersion 1 and include source metadata");
  for (const field of ["id", "title", "url", "licenseNote"] as const) if (typeof value.source[field] !== "string" || !value.source[field]) throw new Error(`Manual facts source.${field} is required`);
  if (value.source.priority !== undefined && (!Number.isInteger(value.source.priority) || (value.source.priority as number) < 0)) throw new Error("Manual facts source.priority must be a non-negative integer");
  if (!Array.isArray(value.entries) || !value.entries.length) throw new Error("Manual facts must contain entries");
  const entries = value.entries.map((entry, index) => {
    if (!isRecord(entry) || !isExternalIdentifier(entry.target) || typeof entry.kind !== "string" || !(ENTITY_KINDS as readonly string[]).includes(entry.kind)) throw new Error(`Manual facts entry ${index} is invalid`);
    for (const field of ["name", "slug", "description", "citationUrl"] as const) if (entry[field] !== undefined && typeof entry[field] !== "string") throw new Error(`Manual facts entry ${index}.${field} must be a string`);
    if (entry.aliases !== undefined && (!Array.isArray(entry.aliases) || entry.aliases.some((alias) => typeof alias !== "string" || !alias))) throw new Error(`Manual facts entry ${index}.aliases must contain strings`);
    if (entry.retired !== undefined && entry.retired !== true) throw new Error(`Manual facts entry ${index}.retired must be true when present`);
    if (![entry.name, entry.slug, entry.description, entry.aliases, entry.retired].some((field) => field !== undefined)) throw new Error(`Manual facts entry ${index} contains no facts`);
    return entry as unknown as ManualFactsDocument["entries"][number];
  });
  return { schemaVersion: 1, source: value.source as unknown as ManualFactsDocument["source"], entries };
}

function isExternalIdentifier(value: unknown): value is ExternalIdentifier {
  return isRecord(value) && ["sourceId", "namespace", "value"].every((field) => typeof value[field] === "string" && Boolean(value[field]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
