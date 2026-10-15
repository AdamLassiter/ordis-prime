"use server";

import { redirect } from "next/navigation";
import { deleteLocalAccount } from "@ordis-prime/db";
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
