"use server";

import { revalidatePath } from "next/cache";
import { setNodeCompletion, setNodeObjectiveCompletion } from "@ordis-prime/db";
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

export async function updateNodeObjectiveCompletion(
  slug: string,
  sourceId: string,
  objectiveKey: string,
  form: FormData,
) {
  const session = await requireCurrentSession();
  const state = String(form.get("state") ?? "");
  if (state !== "incomplete" && state !== "completed")
    throw new Error("Node objective completion state is invalid");
  setNodeObjectiveCompletion(
    getDatabase(),
    session.user.id,
    { slug, sourceId, objectiveKey },
    state === "completed",
  );
  revalidatePath("/planner");
  revalidatePath("/star-chart");
  revalidatePath(`/nodes/${slug}`);
}
