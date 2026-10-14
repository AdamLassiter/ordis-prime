import { redirect } from "next/navigation";
import { listPlayerNotifications, listPlayerTodos, listWorldStateWatches, type PlayerNotification, type PlayerTodo, type WorldStateWatch } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import { addTodo, addWatch, changeTodoStatus, changeWatchEnabled, editWatch, readNotification, removeTodo, removeWatch } from "./actions";

export const dynamic = "force-dynamic";

export default async function TodosPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");
  const todos = listPlayerTodos(getDatabase(), session.user.id);
  const watches = listWorldStateWatches(getDatabase(), session.user.id);
  const notifications = listPlayerNotifications(getDatabase(), session.user.id);
  const open = todos.filter(({ status }) => status === "open");
  const completed = todos.filter(({ status }) => status === "completed");
  return <>
    <p className="eyebrow">Private workspace</p>
    <h1>Todo list</h1>
    <p className="lede">Keep the loose ends from your tabs, farming plans and weekly routine together. World-state watches turn matching live windows into private, deduplicated alerts.</p>
    {notifications.length > 0 && <NotificationSection notifications={notifications} />}
    <section className="planner-section">
      <h2>World-state watches</h2>
      <form className="card form-stack todo-create" action={addWatch}>
        <p className="muted">Filters are case-insensitive. Leave text filters blank to watch every window of that kind.</p>
        <WatchFields />
        <button className="button">Add watch</button>
      </form>
      {watches.length > 0 && <div className="watch-list">{watches.map((watch) => <article className="card watch-card" key={watch.id}>
        <div><span className="tag">{watch.kind}</span>{!watch.enabled && <span className="tag">paused</span>}<h3>{watch.labelContains ? `Label contains “${watch.labelContains}”` : `All ${watch.kind} windows`}</h3>
          <p className="muted">{watch.trigger}{watch.trigger === "active" ? "" : ` · ${watch.leadMinutes} minute lead`}{watch.stateEquals ? ` · state ${watch.stateEquals}` : ""}{watch.nodeContains ? ` · node contains ${watch.nodeContains}` : ""}</p></div>
        <div className="todo-actions"><form action={changeWatchEnabled.bind(null, watch.id, !watch.enabled)}><button className="nav-button">{watch.enabled ? "Pause" : "Resume"}</button></form><form action={removeWatch.bind(null, watch.id)}><button className="nav-button danger-text">Delete watch and its alerts</button></form></div>
        <details><summary>Edit watch</summary><form className="form-stack compact-form" action={editWatch.bind(null, watch.id)}><WatchFields watch={watch} /><button className="nav-button">Save watch</button></form></details>
      </article>)}</div>}
    </section>
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

function WatchFields({ watch }: { watch?: WorldStateWatch }) {
  return <>
    <label>Kind<select name="kind" defaultValue={watch?.kind ?? "cycle"}><option value="cycle">Cycle</option><option value="event">Event</option><option value="alert">Alert</option><option value="fissure">Void Fissure</option><option value="trader">Trader</option></select></label>
    <label>Label contains<input name="labelContains" maxLength={120} placeholder="Cetus or Lith" defaultValue={watch?.labelContains} /></label>
    <label>State equals<input name="stateEquals" maxLength={120} placeholder="night" defaultValue={watch?.stateEquals} /></label>
    <label>Node contains<input name="nodeContains" maxLength={120} placeholder="Mercury" defaultValue={watch?.nodeContains} /></label>
    <label>Notify when<select name="trigger" defaultValue={watch?.trigger ?? "ending"}><option value="active">Matching window is active</option><option value="starting">Window starts within lead time</option><option value="ending">Window ends within lead time</option></select></label>
    <label>Lead time (minutes)<input name="leadMinutes" type="number" min="0" max="10080" step="1" defaultValue={watch?.leadMinutes ?? 10} required /></label>
  </>;
}

function NotificationSection({ notifications }: { notifications: PlayerNotification[] }) {
  return <section className="planner-section">
    <h2>Alerts</h2>
    <div className="notification-list">{notifications.map((notification) => <article className={`card notification-card${notification.readAt === undefined ? " unread" : ""}`} key={notification.id}>
      <div><h3>{notification.title}</h3><p>{notification.body}</p><p className="muted">Created {formatInstant(notification.createdAt)}{notification.expiresAt !== undefined ? ` · ends ${formatInstant(notification.expiresAt)}` : ""}</p></div>
      {notification.readAt === undefined && <form action={readNotification.bind(null, notification.id)}><button className="button">Mark read</button></form>}
    </article>)}</div>
  </section>;
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

function formatInstant(timestamp: number): string {
  return `${new Date(timestamp).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
