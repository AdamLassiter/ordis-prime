"use server";

import { revalidatePath } from "next/cache";
import {
  listStarChartNodes,
  NODE_COMPLETION_MODES,
  setNodeCompletions,
  type NodeCompletionMode,
} from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { requireCurrentSession } from "@/lib/session";

const MAX_BULK_NODES = 1_000;

export async function updateVisibleNodeCompletions(form: FormData) {
  const session = await requireCurrentSession();
  const slugs = form.getAll("node").map(String);
  const normalCompletedSlugs = form.getAll("normal-completed").map(String);
  const steelPathCompletedSlugs = form
    .getAll("steel-path-completed")
    .map(String);
  if (!slugs.length || slugs.length > MAX_BULK_NODES)
    throw new Error("Bulk node completion scope is invalid");
  const scoped = new Set(slugs);
  const normalCompleted = new Set(normalCompletedSlugs);
  const steelPathCompleted = new Set(steelPathCompletedSlugs);
  if (
    scoped.size !== slugs.length ||
    normalCompleted.size !== normalCompletedSlugs.length ||
    steelPathCompleted.size !== steelPathCompletedSlugs.length
  )
    throw new Error("Bulk node completion contains duplicates");
  if (
    [...normalCompletedSlugs, ...steelPathCompletedSlugs].some(
      (slug) => !scoped.has(slug),
    )
  )
    throw new Error("Completed node is outside the visible scope");

  setNodeCompletions(
    getDatabase(),
    session.user.id,
    slugs.flatMap((slug) => [
      { slug, mode: "normal" as const, completed: normalCompleted.has(slug) },
      {
        slug,
        mode: "steel-path" as const,
        completed: steelPathCompleted.has(slug),
      },
    ]),
  );
  revalidateNodeProgress();
}

export async function completeNodeScope(form: FormData) {
  const session = await requireCurrentSession();
  const mode = String(form.get("mode") ?? "") as NodeCompletionMode;
  if (!(NODE_COMPLETION_MODES as readonly string[]).includes(mode))
    throw new Error("Node completion mode is invalid");
  const planet = String(form.get("planet") ?? "").trim();
  const nodes = listStarChartNodes(getDatabase());
  const scoped = planet
    ? nodes.filter((node) => node.planet === planet)
    : nodes;
  if (!scoped.length || scoped.length > MAX_BULK_NODES)
    throw new Error("Bulk node completion scope is invalid");
  if (planet && !nodes.some((node) => node.planet === planet))
    throw new Error("Bulk node completion planet is invalid");

  setNodeCompletions(
    getDatabase(),
    session.user.id,
    scoped.map((node) => ({ slug: node.slug, mode, completed: true })),
  );
  revalidateNodeProgress();
}

function revalidateNodeProgress() {
  revalidatePath("/star-chart");
  revalidatePath("/nodes/[slug]", "page");
  revalidatePath("/planner");
}
