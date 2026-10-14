"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { addBuildAcquisitionGoals, clonePlayerBuild, configureBuildEquipment, createBuildShare, createPlayerBuild, deletePlayerBuild, removeBuildEquipment, removeBuildMod, revokeBuildShare, setBuildEquipment, setBuildMod, updatePlayerBuild, type BuildSlot } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { requireCurrentSession } from "@/lib/session";

export async function addBuild(form: FormData) {
  const session = await requireCurrentSession();
  const id = createPlayerBuild(getDatabase(), session.user.id, { title: String(form.get("title") ?? ""), category: String(form.get("category") ?? ""), notes: String(form.get("notes") ?? "") });
  redirect(`/builds/${id}`);
}

export async function saveBuildDetails(buildId: string, form: FormData) {
  const session = await requireCurrentSession();
  updatePlayerBuild(getDatabase(), session.user.id, buildId, { title: String(form.get("title") ?? ""), category: String(form.get("category") ?? ""), notes: String(form.get("notes") ?? "") });
  revalidatePath(`/builds/${buildId}`);
  revalidatePath("/builds");
}

export async function assignEquipment(buildId: string, slot: BuildSlot, kind: string, slug: string) {
  const session = await requireCurrentSession();
  setBuildEquipment(getDatabase(), session.user.id, buildId, slot, { kind, slug });
  revalidatePath(`/builds/${buildId}`);
}

export async function saveEquipmentNotes(buildId: string, slot: BuildSlot, kind: string, slug: string, form: FormData) {
  const session = await requireCurrentSession();
  setBuildEquipment(getDatabase(), session.user.id, buildId, slot, { kind, slug }, String(form.get("notes") ?? ""));
  revalidatePath(`/builds/${buildId}`);
}

export async function saveEquipmentConfiguration(buildId: string, slot: BuildSlot, form: FormData) {
  const session = await requireCurrentSession();
  const rawFormaCount = String(form.get("formaCount") ?? "");
  if (!/^\d+$/.test(rawFormaCount)) throw new Error("Forma count must be a non-negative integer");
  configureBuildEquipment(getDatabase(), session.user.id, buildId, slot, {
    configuration: String(form.get("configuration") ?? ""),
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

export async function assignMod(buildId: string, slot: BuildSlot, position: number, kind: string, slug: string, form: FormData) {
  const session = await requireCurrentSession();
  const rawRank = String(form.get("rank") ?? "");
  if (rawRank && !/^\d+$/.test(rawRank)) throw new Error("Mod rank must be a non-negative integer");
  setBuildMod(getDatabase(), session.user.id, buildId, slot, position, { kind, slug }, rawRank ? Number(rawRank) : undefined);
  revalidatePath(`/builds/${buildId}`);
}

export async function clearMod(buildId: string, slot: BuildSlot, position: number) {
  const session = await requireCurrentSession();
  removeBuildMod(getDatabase(), session.user.id, buildId, slot, position);
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
