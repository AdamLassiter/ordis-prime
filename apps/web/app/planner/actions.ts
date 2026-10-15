"use server";

import { revalidatePath } from "next/cache";
import { setPlayerGoal, setPlayerRecipePreference } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { requireCurrentSession } from "@/lib/session";

export async function updateGoal(kind: string, slug: string, form: FormData) {
  const session = await requireCurrentSession();
  const raw = String(form.get("targetQuantity") ?? "");
  if (!/^\d+$/.test(raw))
    throw new Error("Goal quantity must be a non-negative integer");
  const targetQuantity = Number(raw);
  if (!Number.isSafeInteger(targetQuantity))
    throw new Error("Goal quantity is too large");
  setPlayerGoal(getDatabase(), session.user.id, { kind, slug }, targetQuantity);
  revalidatePath("/planner");
  revalidatePath(`/catalog/${kind}/${slug}`);
}

export async function chooseRecipe(
  kind: string,
  slug: string,
  recipeId: string,
) {
  const session = await requireCurrentSession();
  setPlayerRecipePreference(
    getDatabase(),
    session.user.id,
    { kind, slug },
    recipeId || undefined,
  );
  revalidatePath("/planner");
}
