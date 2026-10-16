"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  addBuildAcquisitionGoals,
  clonePlayerBuild,
  cloneSharedBuild,
  configureBuildEquipment,
  createBuildShare,
  createPlayerBuild,
  deletePlayerBuild,
  removeBuildEnhancement,
  removeBuildEquipment,
  removeBuildMod,
  removeBuildModSlot,
  revokeBuildShare,
  setBuildEnhancement,
  setBuildEquipment,
  setBuildMod,
  setBuildModSlot,
  updatePlayerBuild,
  type BuildEnhancementSlot,
  type BuildModSlotRole,
  type BuildSlot,
} from "@ordis-prime/db";
import type { ModPolarity } from "@ordis-prime/domain";
import { getDatabase } from "@/lib/database";
import { requireCurrentSession } from "@/lib/session";

export async function addBuild(form: FormData) {
  const session = await requireCurrentSession();
  const id = createPlayerBuild(getDatabase(), session.user.id, {
    title: String(form.get("title") ?? ""),
    category: String(form.get("category") ?? ""),
    notes: String(form.get("notes") ?? ""),
  });
  redirect(`/builds/${id}`);
}

export async function saveBuildDetails(buildId: string, form: FormData) {
  const session = await requireCurrentSession();
  updatePlayerBuild(getDatabase(), session.user.id, buildId, {
    title: String(form.get("title") ?? ""),
    category: String(form.get("category") ?? ""),
    notes: String(form.get("notes") ?? ""),
  });
  revalidatePath(`/builds/${buildId}`);
  revalidatePath("/builds");
}

export async function assignEquipment(
  buildId: string,
  slot: BuildSlot,
  kind: string,
  slug: string,
) {
  const session = await requireCurrentSession();
  setBuildEquipment(getDatabase(), session.user.id, buildId, slot, {
    kind,
    slug,
  });
  revalidatePath(`/builds/${buildId}`);
}

export async function saveEquipmentNotes(
  buildId: string,
  slot: BuildSlot,
  kind: string,
  slug: string,
  form: FormData,
) {
  const session = await requireCurrentSession();
  setBuildEquipment(
    getDatabase(),
    session.user.id,
    buildId,
    slot,
    { kind, slug },
    String(form.get("notes") ?? ""),
  );
  revalidatePath(`/builds/${buildId}`);
}

export async function saveEquipmentConfiguration(
  buildId: string,
  slot: BuildSlot,
  form: FormData,
) {
  const session = await requireCurrentSession();
  const rawFormaCount = String(form.get("formaCount") ?? "");
  const rawRank = String(form.get("rank") ?? "");
  if (!/^\d+$/.test(rawFormaCount))
    throw new Error("Forma count must be a non-negative integer");
  if (rawRank && !/^\d+$/.test(rawRank))
    throw new Error("Equipment rank must be a non-negative integer");
  configureBuildEquipment(getDatabase(), session.user.id, buildId, slot, {
    configuration: String(form.get("configuration") ?? ""),
    rank: rawRank ? Number(rawRank) : undefined,
    formaCount: Number(rawFormaCount),
    capacityUpgrade: form.get("capacityUpgrade") === "yes",
  });
  revalidatePath(`/builds/${buildId}`);
}

export async function clearEquipment(buildId: string, slot: BuildSlot) {
  const session = await requireCurrentSession();
  removeBuildEquipment(getDatabase(), session.user.id, buildId, slot);
  revalidatePath(`/builds/${buildId}`);
}

export async function saveModSlot(
  buildId: string,
  slot: BuildSlot,
  form: FormData,
) {
  const session = await requireCurrentSession();
  const rawPosition = String(form.get("position") ?? "");
  if (!/^\d+$/.test(rawPosition))
    throw new Error("Mod slot position must be a non-negative integer");
  const polarity = String(form.get("polarity") ?? "");
  setBuildModSlot(
    getDatabase(),
    session.user.id,
    buildId,
    slot,
    Number(rawPosition),
    String(form.get("role") ?? "") as BuildModSlotRole,
    polarity ? (polarity as ModPolarity) : undefined,
  );
  revalidatePath(`/builds/${buildId}`);
}

export async function clearModSlot(
  buildId: string,
  slot: BuildSlot,
  position: number,
) {
  const session = await requireCurrentSession();
  removeBuildModSlot(getDatabase(), session.user.id, buildId, slot, position);
  revalidatePath(`/builds/${buildId}`);
}

export async function assignMod(
  buildId: string,
  slot: BuildSlot,
  position: number,
  kind: string,
  slug: string,
  form: FormData,
) {
  const session = await requireCurrentSession();
  const rawRank = String(form.get("rank") ?? "");
  if (rawRank && !/^\d+$/.test(rawRank))
    throw new Error("Mod rank must be a non-negative integer");
  setBuildMod(
    getDatabase(),
    session.user.id,
    buildId,
    slot,
    position,
    { kind, slug },
    rawRank ? Number(rawRank) : undefined,
  );
  revalidatePath(`/builds/${buildId}`);
}

export async function clearMod(
  buildId: string,
  slot: BuildSlot,
  position: number,
) {
  const session = await requireCurrentSession();
  removeBuildMod(getDatabase(), session.user.id, buildId, slot, position);
  revalidatePath(`/builds/${buildId}`);
}

export async function assignEnhancement(
  buildId: string,
  slot: BuildEnhancementSlot,
  kind: string,
  slug: string,
  form: FormData,
) {
  const session = await requireCurrentSession();
  const rawRank = String(form.get("rank") ?? "");
  if (rawRank && !/^\d+$/.test(rawRank))
    throw new Error("Enhancement rank must be a non-negative integer");
  const optionKey = String(form.get("optionKey") ?? "") || undefined;
  setBuildEnhancement(
    getDatabase(),
    session.user.id,
    buildId,
    slot,
    { kind, slug },
    rawRank ? Number(rawRank) : undefined,
    optionKey,
  );
  revalidatePath(`/builds/${buildId}`);
}

export async function clearEnhancement(
  buildId: string,
  slot: BuildEnhancementSlot,
) {
  const session = await requireCurrentSession();
  removeBuildEnhancement(getDatabase(), session.user.id, buildId, slot);
  revalidatePath(`/builds/${buildId}`);
}

export async function shareBuild(buildId: string) {
  const session = await requireCurrentSession();
  const shareKey = createBuildShare(getDatabase(), session.user.id, buildId);
  redirect(`/builds/shared/${shareKey}`);
}

export async function removeBuild(buildId: string) {
  const session = await requireCurrentSession();
  deletePlayerBuild(getDatabase(), session.user.id, buildId);
  redirect("/builds");
}

export async function cloneBuild(buildId: string) {
  const session = await requireCurrentSession();
  const cloneId = clonePlayerBuild(getDatabase(), session.user.id, buildId);
  redirect(`/builds/${cloneId}`);
}

export async function cloneSharedBuildToDraft(shareKey: string) {
  const session = await requireCurrentSession();
  const cloneId = cloneSharedBuild(getDatabase(), session.user.id, shareKey);
  redirect(`/builds/${cloneId}`);
}

export async function revokeShare(buildId: string, shareKey: string) {
  const session = await requireCurrentSession();
  revokeBuildShare(getDatabase(), session.user.id, buildId, shareKey);
  revalidatePath(`/builds/${buildId}`);
  revalidatePath(`/builds/shared/${shareKey}`);
}

export async function planBuildAcquisition(buildId: string) {
  const session = await requireCurrentSession();
  addBuildAcquisitionGoals(getDatabase(), session.user.id, buildId);
  revalidatePath(`/builds/${buildId}`);
  redirect("/planner");
}
