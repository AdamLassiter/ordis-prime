"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  deleteLocalAccount,
  setPlayerPreferences,
  type PlayerPreferences,
} from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { requireCurrentSession } from "@/lib/session";
import { verifyLocalPassword } from "@/lib/auth-factory";

export async function deleteOwnAccount(form: FormData) {
  const session = await requireCurrentSession();
  if (String(form.get("confirmation") ?? "") !== "DELETE")
    throw new Error("Type DELETE to confirm account deletion");
  const database = getDatabase();
  if (
    !(await verifyLocalPassword(
      database,
      session.user.id,
      String(form.get("password") ?? ""),
    ))
  )
    throw new Error("Current password is incorrect");
  deleteLocalAccount(database, session.user.id);
  redirect("/sign-in?deleted=1");
}

export async function updateInterfacePreferences(form: FormData) {
  const session = await requireCurrentSession();
  const collectionLayout = String(form.get("collectionLayout") ?? "");
  const displayDensity = String(form.get("displayDensity") ?? "");
  const collectionHighlighting = String(
    form.get("collectionHighlighting") ?? "",
  );
  setPlayerPreferences(getDatabase(), session.user.id, {
    collectionLayout,
    displayDensity,
    collectionHighlighting,
  } as PlayerPreferences);
  revalidatePath("/", "layout");
  redirect("/account?preferences=saved");
}
