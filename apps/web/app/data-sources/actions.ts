"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { CATALOG_SOURCE_REFRESH_JOB, enqueueJobNow, WORLD_STATE_REFRESH_JOB } from "@ordis-prime/db";
import { ManualDiscoveryAdapter, ManualFactsAdapter, ManualRankingAdapter, refreshSource, SnapshotStore } from "@ordis-prime/ingestion";
import { getDatabase, getDataDirectory } from "@/lib/database";
import { requireCurrentSession } from "@/lib/session";

const CATALOG_SOURCES = ["wfcd-items", "wfcd-drops"] as const;
const MANUAL_TYPES = ["ranking", "discovery", "facts"] as const;
const RESERVED_SOURCE_IDS = new Set(["wfcd-items", "wfcd-drops", "wfcd-worldstate"]);

export async function queueSourceRefresh(sourceId: string) {
  const session = await requireCurrentSession();
  if (session.user.role !== "admin") throw new Error("Administrator access required");
  const isCatalog = (CATALOG_SOURCES as readonly string[]).includes(sourceId);
  if (!isCatalog && sourceId !== "wfcd-worldstate") throw new Error("Source cannot be refreshed by the automatic worker");
  enqueueJobNow(getDatabase(), {
    kind: isCatalog ? CATALOG_SOURCE_REFRESH_JOB : WORLD_STATE_REFRESH_JOB,
    payload: { source: sourceId },
  });
  revalidatePath("/data-sources");
}

export async function importManualSource(form: FormData) {
  const session = await requireCurrentSession();
  if (session.user.role !== "admin") throw new Error("Administrator access required");
  const type = String(form.get("type") ?? "");
  if (!(MANUAL_TYPES as readonly string[]).includes(type)) throw new Error("Manual source type is invalid");
  const file = form.get("file");
  if (!(file instanceof File) || file.size < 1 || file.size > 1_000_000) throw new Error("Manual source must be a non-empty YAML file no larger than 1 MB");
  if (!/\.ya?ml$/i.test(file.name)) throw new Error("Manual source filename must end in .yaml or .yml");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const adapter = type === "ranking" ? ManualRankingAdapter.fromBytes(bytes)
    : type === "discovery" ? ManualDiscoveryAdapter.fromBytes(bytes)
      : ManualFactsAdapter.fromBytes(bytes);
  if (RESERVED_SOURCE_IDS.has(adapter.source.id)) throw new Error("Manual source ID is reserved for an automatic provider");
  await refreshSource({ adapter, database: getDatabase(), snapshotStore: new SnapshotStore(path.join(getDataDirectory(), "sources")) });
  revalidatePath("/data-sources");
  revalidatePath(`/data-sources/${adapter.source.id}`);
  revalidatePath("/");
}
