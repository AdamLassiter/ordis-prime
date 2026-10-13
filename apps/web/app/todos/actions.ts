"use server";

import { revalidatePath } from "next/cache";
import { createPlayerTodo, deletePlayerTodo, setPlayerTodoStatus } from "@ordis-prime/db";
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
