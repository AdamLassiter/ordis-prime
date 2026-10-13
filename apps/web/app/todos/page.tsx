import { redirect } from "next/navigation";
import { listPlayerTodos, type PlayerTodo } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import { addTodo, changeTodoStatus, removeTodo } from "./actions";

export const dynamic = "force-dynamic";

export default async function TodosPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");
  const todos = listPlayerTodos(getDatabase(), session.user.id);
  const open = todos.filter(({ status }) => status === "open");
  const completed = todos.filter(({ status }) => status === "completed");
  return <>
    <p className="eyebrow">Private workspace</p>
    <h1>Todo list</h1>
    <p className="lede">Keep the loose ends from your tabs, farming plans and weekly routine together. Dynamic world-state watches will appear alongside these tasks.</p>
    <form className="card form-stack todo-create" action={addTodo}>
      <h2>Add a task</h2>
      <label>Task<input name="title" required maxLength={160} placeholder="Farm the last Necramech part" /></label>
      <label>Notes<textarea name="notes" maxLength={4000} rows={3} placeholder="Optional context, build link, or checklist" /></label>
      <label>Due date<input name="dueDate" type="date" /></label>
      <button className="button">Add task</button>
    </form>
    <TodoSection title="Open" todos={open} />
    {completed.length > 0 && <TodoSection title="Completed" todos={completed} />}
  </>;
}

function TodoSection({ title, todos }: { title: string; todos: PlayerTodo[] }) {
  return <section className="planner-section">
    <h2>{title}</h2>
    {todos.length ? <div className="todo-list">{todos.map((todo) => <article className={`card todo-card ${todo.status}`} key={todo.id}>
      <div>
        <h3>{todo.title}</h3>
        {todo.notes && <p className="muted todo-notes">{todo.notes}</p>}
        {todo.dueAt !== undefined && <p className="todo-due">Due <time dateTime={new Date(todo.dueAt).toISOString().slice(0, 10)}>{formatDate(todo.dueAt)}</time></p>}
      </div>
      <div className="todo-actions">
        <form action={changeTodoStatus.bind(null, todo.id, todo.status === "open" ? "completed" : "open")}><button className="button">{todo.status === "open" ? "Complete" : "Reopen"}</button></form>
        <form action={removeTodo.bind(null, todo.id)}><button className="nav-button danger-text">Delete</button></form>
      </div>
    </article>)}</div> : <p className="notice">No {title.toLowerCase()} tasks.</p>}
  </section>;
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(timestamp);
}
