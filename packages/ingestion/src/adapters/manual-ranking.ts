import fs from "node:fs/promises";
import { parse } from "yaml";
import type { Observation } from "@ordis-prime/domain";
import {
  contentHash,
  type FetchContext,
  type Snapshot,
  type SourceAdapter,
  type SourceDescriptor,
} from "../adapter.ts";

interface ManualRankingDocument {
  schemaVersion: 2;
  source: {
    id: string;
    title: string;
    author: string;
    url: string;
    publishedAt: string;
    gameVersion?: string;
    scope: string;
    licenseNote: string;
    priority?: number;
  };
  subject: {
    sourceId: string;
    namespace: string;
  };
  scale: string[];
  entries: Array<{
    externalId: string;
    rank: string;
    position?: number;
    timestampSeconds?: number;
    notes?: string;
  }>;
}

export class ManualRankingAdapter implements SourceAdapter {
  readonly source: SourceDescriptor;
  private readonly filePath?: string;
  private readonly providedBytes?: Uint8Array;

  private constructor(
    document: ManualRankingDocument,
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

  static async fromFile(filePath: string): Promise<ManualRankingAdapter> {
    const bytes = await fs.readFile(filePath);
    return new ManualRankingAdapter(parseDocument(bytes), filePath);
  }

  static fromBytes(bytes: Uint8Array): ManualRankingAdapter {
    return new ManualRankingAdapter(
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
    const baseEvidence = {
      sourceId: this.source.id,
      sourceRecordKey: document.source.id,
      snapshotVersion: snapshot.version,
      retrievedAt: snapshot.retrievedAt,
      citationUrl: document.source.url,
      license: document.source.licenseNote,
    };
    yield {
      type: "ranking-set",
      key: document.source.id,
      title: document.source.title,
      author: document.source.author,
      publishedAt: document.source.publishedAt,
      gameVersion: document.source.gameVersion,
      scope: document.source.scope,
      scale: document.scale,
      licenseNote: document.source.licenseNote,
      evidence: { ...baseEvidence, path: "source" },
    };
    for (const [index, entry] of document.entries.entries()) {
      yield {
        type: "ranking",
        setKey: document.source.id,
        subjectExternalId: {
          sourceId: document.subject.sourceId,
          namespace: document.subject.namespace,
          value: entry.externalId,
        },
        tier: entry.rank,
        position: entry.position,
        timestampSeconds: entry.timestampSeconds,
        notes: entry.notes,
        evidence: {
          ...baseEvidence,
          sourceRecordKey: entry.externalId,
          path: `entries[${index}]`,
        },
      };
    }
  }
}

function parseDocument(bytes: Uint8Array): ManualRankingDocument {
  const value = parse(new TextDecoder().decode(bytes)) as unknown;
  if (
    !isRecord(value) ||
    value.schemaVersion !== 2 ||
    !isRecord(value.source) ||
    !isRecord(value.subject)
  )
    throw new Error(
      "Manual ranking must use schemaVersion 2 and include source and subject metadata",
    );
  const source = value.source;
  const subject = value.subject;
  for (const field of ["sourceId", "namespace"] as const)
    if (typeof subject[field] !== "string" || !subject[field])
      throw new Error(`Manual ranking subject.${field} is required`);
  const requiredSourceStrings = [
    "id",
    "title",
    "author",
    "url",
    "publishedAt",
    "scope",
    "licenseNote",
  ] as const;
  for (const field of requiredSourceStrings)
    if (typeof source[field] !== "string" || !source[field])
      throw new Error(`Manual ranking source.${field} is required`);
  if (
    source.gameVersion !== undefined &&
    typeof source.gameVersion !== "string"
  )
    throw new Error("Manual ranking source.gameVersion must be a string");
  if (
    source.priority !== undefined &&
    (!Number.isInteger(source.priority) || (source.priority as number) < 0)
  )
    throw new Error(
      "Manual ranking source.priority must be a non-negative integer",
    );
  if (
    !Array.isArray(value.scale) ||
    !value.scale.length ||
    value.scale.some((tier) => typeof tier !== "string" || !tier)
  )
    throw new Error("Manual ranking scale must contain tier names");
  const scale = value.scale as string[];
  if (new Set(scale).size !== scale.length)
    throw new Error("Manual ranking scale contains duplicate tiers");
  if (!Array.isArray(value.entries) || !value.entries.length)
    throw new Error("Manual ranking must contain entries");

  const entries = value.entries.map((entry, index) => {
    if (
      !isRecord(entry) ||
      typeof entry.externalId !== "string" ||
      !entry.externalId ||
      typeof entry.rank !== "string" ||
      !entry.rank
    )
      throw new Error(`Manual ranking entry ${index} is invalid`);
    if (!scale.includes(entry.rank))
      throw new Error(
        `Manual ranking entry ${index} uses undeclared tier ${entry.rank}`,
      );
    for (const field of ["position", "timestampSeconds"] as const) {
      if (
        entry[field] !== undefined &&
        (!Number.isInteger(entry[field]) ||
          (entry[field] as number) < (field === "position" ? 1 : 0))
      )
        throw new Error(`Manual ranking entry ${index} has invalid ${field}`);
    }
    if (entry.notes !== undefined && typeof entry.notes !== "string")
      throw new Error(`Manual ranking entry ${index} has invalid notes`);
    return entry as ManualRankingDocument["entries"][number];
  });
  return {
    schemaVersion: 2,
    source: source as unknown as ManualRankingDocument["source"],
    subject: subject as unknown as ManualRankingDocument["subject"],
    scale,
    entries,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
