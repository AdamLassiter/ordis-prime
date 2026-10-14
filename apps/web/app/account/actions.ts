"use server";

import { redirect } from "next/navigation";
import { deleteLocalAccount } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { requireCurrentSession } from "@/lib/session";

export async function deleteOwnAccount(form: FormData) {
  const session = await requireCurrentSession();
  if (String(form.get("confirmation") ?? "") !== "DELETE") throw new Error("Type DELETE to confirm account deletion");
  deleteLocalAccount(getDatabase(), session.user.id);
  redirect("/sign-in?deleted=1");
}
