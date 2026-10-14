"use server";

import { revalidatePath } from "next/cache";
import { CATALOG_SOURCE_REFRESH_JOB, enqueueJobNow, WORLD_STATE_REFRESH_JOB } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { requireCurrentSession } from "@/lib/session";

const CATALOG_SOURCES = ["wfcd-items", "wfcd-drops"] as const;

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
