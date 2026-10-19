"use server";

import { revalidatePath } from "next/cache";
import { setNodeCompletions } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { requireCurrentSession } from "@/lib/session";

const MAX_BULK_NODES = 1_000;

export async function updateVisibleNodeCompletions(form: FormData) {
  const session = await requireCurrentSession();
  const slugs = form.getAll("node").map(String);
  const completedSlugs = form.getAll("completed").map(String);
  if (!slugs.length || slugs.length > MAX_BULK_NODES)
    throw new Error("Bulk node completion scope is invalid");
  const scoped = new Set(slugs);
  const completed = new Set(completedSlugs);
  if (scoped.size !== slugs.length || completed.size !== completedSlugs.length)
    throw new Error("Bulk node completion contains duplicates");
  if (completedSlugs.some((slug) => !scoped.has(slug)))
    throw new Error("Completed node is outside the visible scope");

  setNodeCompletions(
    getDatabase(),
    session.user.id,
    slugs.map((slug) => ({ slug, completed: completed.has(slug) })),
  );
  revalidatePath("/star-chart");
  revalidatePath("/nodes/[slug]", "page");
  revalidatePath("/planner");
}
