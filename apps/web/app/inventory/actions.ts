"use server";

import { revalidatePath } from "next/cache";
import { setPlayerProgression } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { requireCurrentSession } from "@/lib/session";

export async function updateProgression(form: FormData) {
  const session = await requireCurrentSession();
  const masteryRaw = String(form.get("masteryRank") ?? "").trim();
  const intrinsicRaw = String(form.get("railjackIntrinsicRank") ?? "").trim();
  setPlayerProgression(getDatabase(), session.user.id, {
    masteryRank: masteryRaw === "" ? undefined : Number(masteryRaw),
    railjackIntrinsicRank:
      intrinsicRaw === "" ? undefined : Number(intrinsicRaw),
  });
  revalidatePath("/inventory");
  revalidatePath("/planner");
  revalidatePath("/builds");
  revalidatePath("/star-chart");
}
