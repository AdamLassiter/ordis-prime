"use server";

import { revalidatePath } from "next/cache";
import { setDiscoveryProgress, type DiscoveryProgressState } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { requireCurrentSession } from "@/lib/session";

export async function updateDiscoveryProgress(kind: string, slug: string, form: FormData) {
  const session = await requireCurrentSession();
  const state = String(form.get("state") ?? "") as DiscoveryProgressState;
  setDiscoveryProgress(getDatabase(), session.user.id, { kind, slug }, state);
  revalidatePath("/discovery");
  revalidatePath(`/catalog/${kind}/${slug}`);
}
