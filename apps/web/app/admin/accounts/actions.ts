"use server";

import { revalidatePath } from "next/cache";
import { setLocalAccountRole } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { requireCurrentSession } from "@/lib/session";

export async function changeAccountRole(
  targetUserId: string,
  role: "admin" | "player",
) {
  const session = await requireCurrentSession();
  if (session.user.role !== "admin")
    throw new Error("Administrator access required");
  setLocalAccountRole(getDatabase(), {
    actorUserId: session.user.id,
    targetUserId,
    role,
  });
  revalidatePath("/admin/accounts");
}
