"use server";

import { revalidatePath } from "next/cache";
import { reopenSourceConflict, reviewSourceConflict } from "@ordis-prime/db";
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
