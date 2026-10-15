"use server";

import { revalidatePath } from "next/cache";
import { setPlayerMasteryRank } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { requireCurrentSession } from "@/lib/session";

export async function updateMasteryRank(form: FormData) {
  const session = await requireCurrentSession();
  const raw = String(form.get("masteryRank") ?? "").trim();
  const masteryRank = raw === "" ? undefined : Number(raw);
  setPlayerMasteryRank(getDatabase(), session.user.id, masteryRank);
  revalidatePath("/inventory");
  revalidatePath("/planner");
}
