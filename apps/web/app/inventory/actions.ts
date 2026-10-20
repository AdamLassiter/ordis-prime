"use server";

import { revalidatePath } from "next/cache";
import { setPlayerProgression } from "@ordis-prime/db";
import {
  isPlayerActiveAdversary,
  type PlayerActiveAdversary,
} from "@ordis-prime/domain";
import { getDatabase } from "@/lib/database";
import { requireCurrentSession } from "@/lib/session";

export async function updateProgression(form: FormData) {
  const session = await requireCurrentSession();
  const masteryRaw = String(form.get("masteryRank") ?? "").trim();
  const intrinsicRaw = String(form.get("railjackIntrinsicRank") ?? "").trim();
  const warframeRankRaw = String(form.get("highestWarframeRank") ?? "").trim();
  const adversaryRaw = String(form.get("activeAdversary") ?? "").trim();
  let activeAdversary: PlayerActiveAdversary | undefined;
  if (adversaryRaw) {
    if (!isPlayerActiveAdversary(adversaryRaw))
      throw new Error("Active adversary is invalid");
    activeAdversary = adversaryRaw;
  }
  setPlayerProgression(getDatabase(), session.user.id, {
    masteryRank: masteryRaw === "" ? undefined : Number(masteryRaw),
    railjackIntrinsicRank:
      intrinsicRaw === "" ? undefined : Number(intrinsicRaw),
    highestWarframeRank:
      warframeRankRaw === "" ? undefined : Number(warframeRankRaw),
    activeAdversary,
  });
  revalidatePath("/inventory");
  revalidatePath("/planner");
  revalidatePath("/builds");
  revalidatePath("/star-chart");
}
