"use server";

import { revalidatePath } from "next/cache";
import { bindSourceIdentityOverride, CATALOG_SOURCE_REFRESH_JOB, enqueueJobNow, reopenSourceConflict, revokeSourceIdentityOverride, reviewSourceConflict } from "@ordis-prime/db";
import type { ExternalIdentifier } from "@ordis-prime/domain";
import { getDatabase } from "@/lib/database";
import { requireCurrentSession } from "@/lib/session";

export async function markConflictReviewed(sourceId: string, conflictId: string, form: FormData) {
  const session = await requireCurrentSession();
  if (session.user.role !== "admin") throw new Error("Administrator access required");
  reviewSourceConflict(getDatabase(), { sourceId, conflictId, userId: session.user.id, note: String(form.get("note") ?? "") });
  revalidatePath(`/data-sources/${sourceId}`);
  revalidatePath("/data-sources");
}

export async function reopenConflict(sourceId: string, conflictId: string, form: FormData) {
  const session = await requireCurrentSession();
  if (session.user.role !== "admin") throw new Error("Administrator access required");
  reopenSourceConflict(getDatabase(), { sourceId, conflictId, userId: session.user.id, note: String(form.get("note") ?? "") });
  revalidatePath(`/data-sources/${sourceId}`);
  revalidatePath("/data-sources");
}

export async function bindConflictIdentity(sourceId: string, conflictId: string, form: FormData) {
  const session = await requireCurrentSession();
  if (session.user.role !== "admin") throw new Error("Administrator access required");
  const database = getDatabase();
  bindSourceIdentityOverride(database, {
    sourceId, conflictId, userId: session.user.id,
    externalId: parseExternalId(form.get("externalId")), entityId: String(form.get("entityId") ?? ""), note: String(form.get("note") ?? ""),
  });
  queueAutomaticReplay(database, sourceId);
  revalidatePath(`/data-sources/${sourceId}`);
  revalidatePath("/data-sources");
}

export async function revokeIdentityOverride(sourceId: string, form: FormData) {
  const session = await requireCurrentSession();
  if (session.user.role !== "admin") throw new Error("Administrator access required");
  const database = getDatabase();
  revokeSourceIdentityOverride(database, {
    sourceId, userId: session.user.id, externalId: parseExternalId(form.get("externalId")), note: String(form.get("note") ?? ""),
  });
  queueAutomaticReplay(database, sourceId);
  revalidatePath(`/data-sources/${sourceId}`);
  revalidatePath("/data-sources");
}

function queueAutomaticReplay(database: ReturnType<typeof getDatabase>, sourceId: string): void {
  if (sourceId !== "wfcd-items" && sourceId !== "wfcd-drops") return;
  enqueueJobNow(database, { kind: CATALOG_SOURCE_REFRESH_JOB, payload: { source: sourceId } });
}

function parseExternalId(value: FormDataEntryValue | null): ExternalIdentifier {
  try {
    const parsed: unknown = JSON.parse(String(value ?? ""));
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      if (typeof record.sourceId === "string" && typeof record.namespace === "string" && typeof record.value === "string") return { sourceId: record.sourceId, namespace: record.namespace, value: record.value };
    }
  } catch {}
  throw new Error("Identity override external identifier is invalid");
}
