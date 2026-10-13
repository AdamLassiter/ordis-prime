"use server";

import { revalidatePath } from "next/cache";
import { setInventoryEntryByReference } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { requireCurrentSession } from "@/lib/session";

export async function updateInventory(kind: string, slug: string, form: FormData) {
  const session = await requireCurrentSession();
  setInventoryEntryByReference(getDatabase(), session.user.id, { kind, slug }, {
    ownedCount: parseCount(form, "ownedCount"),
    builtCount: parseCount(form, "builtCount"),
    wantedCount: parseCount(form, "wantedCount"),
    mastered: parseOptionalBoolean(form, "mastered"),
    subsumed: parseOptionalBoolean(form, "subsumed"),
    note: String(form.get("note") ?? "").trim() || undefined,
  });
  revalidatePath(`/catalog/${kind}/${slug}`);
  revalidatePath("/inventory");
}

function parseCount(form: FormData, field: string): number {
  const raw = String(form.get(field) ?? "");
  if (!/^\d+$/.test(raw)) throw new Error(`${field} must be a non-negative integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new Error(`${field} is too large`);
  return value;
}

function parseOptionalBoolean(form: FormData, field: string): boolean | undefined {
  const value = form.get(field);
  if (value === "yes") return true;
  if (value === "no") return false;
  return undefined;
}
