"use server";

import { revalidatePath } from "next/cache";
import { createPlayerTodo, createWorldStateWatch, deletePlayerTodo, deleteWorldStateWatch, evaluateWorldStateWatches, markPlayerNotificationRead, setPlayerTodoStatus, setWorldStateWatchEnabled } from "@ordis-prime/db";
import type { WorldStateWindowKind } from "@ordis-prime/domain";
import { getDatabase } from "@/lib/database";
import { requireCurrentSession } from "@/lib/session";

export async function addTodo(form: FormData) {
  const session = await requireCurrentSession();
  const dueDate = String(form.get("dueDate") ?? "");
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error("Due date must be a calendar date");
  createPlayerTodo(getDatabase(), session.user.id, {
    title: String(form.get("title") ?? ""),
    notes: String(form.get("notes") ?? ""),
    dueAt: dueDate ? Date.parse(`${dueDate}T00:00:00.000Z`) : undefined,
  });
  revalidatePath("/todos");
}

export async function changeTodoStatus(todoId: string, status: "open" | "completed") {
  const session = await requireCurrentSession();
  setPlayerTodoStatus(getDatabase(), session.user.id, todoId, status);
  revalidatePath("/todos");
}

export async function removeTodo(todoId: string) {
  const session = await requireCurrentSession();
  deletePlayerTodo(getDatabase(), session.user.id, todoId);
  revalidatePath("/todos");
}

export async function addWatch(form: FormData) {
  const session = await requireCurrentSession();
  const rawLead = String(form.get("leadMinutes") ?? "");
  if (!/^\d+$/.test(rawLead)) throw new Error("Lead time must be a non-negative integer");
  const database = getDatabase();
  createWorldStateWatch(database, session.user.id, {
    kind: String(form.get("kind") ?? "") as WorldStateWindowKind,
    labelContains: String(form.get("labelContains") ?? ""),
    stateEquals: String(form.get("stateEquals") ?? ""),
    nodeContains: String(form.get("nodeContains") ?? ""),
    trigger: String(form.get("trigger") ?? "") as "active" | "starting" | "ending",
    leadMinutes: Number(rawLead),
  });
  evaluateWorldStateWatches(database, Date.now(), session.user.id);
  revalidatePath("/todos");
}

export async function removeWatch(watchId: string) {
  const session = await requireCurrentSession();
  deleteWorldStateWatch(getDatabase(), session.user.id, watchId);
  revalidatePath("/todos");
}

export async function changeWatchEnabled(watchId: string, enabled: boolean) {
  const session = await requireCurrentSession();
  const database = getDatabase();
  setWorldStateWatchEnabled(database, session.user.id, watchId, enabled);
  if (enabled) evaluateWorldStateWatches(database, Date.now(), session.user.id);
  revalidatePath("/todos");
}

export async function readNotification(notificationId: string) {
  const session = await requireCurrentSession();
  markPlayerNotificationRead(getDatabase(), session.user.id, notificationId);
  revalidatePath("/todos");
}
