"use server";

import { revalidatePath } from "next/cache";
import { setNodeCompletion } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { requireCurrentSession } from "@/lib/session";

export async function updateNodeCompletion(slug: string, form: FormData) {
  const session = await requireCurrentSession();
  const state = String(form.get("state") ?? "");
  if (state !== "incomplete" && state !== "completed")
    throw new Error("Node completion state is invalid");
  setNodeCompletion(
    getDatabase(),
    session.user.id,
    slug,
    state === "completed",
  );
  revalidatePath("/star-chart");
  revalidatePath(`/nodes/${slug}`);
}
