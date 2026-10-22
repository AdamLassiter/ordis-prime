import Link from "next/link";
import type { PlayerTodo } from "@ordis-prime/db";
import { addTodo, changeTodoStatus, removeTodo } from "@/app/todos/actions";

export function TaskManager({ todos }: { todos: PlayerTodo[] }) {
  const open = todos.filter(({ status }) => status === "open");
  const completed = todos.filter(({ status }) => status === "completed");
  return (
    <section className="planner-section" id="tasks">
      <h2>Foundry tasks</h2>
      <p className="muted">
        Keep farming notes and recurring collection work beside the acquisition
        plan. Time-sensitive world-state alarms remain under Directives.
      </p>
      <form className="card form-stack todo-create" action={addTodo}>
        <h3>Add a task</h3>
        <label>
          Task
          <input
            name="title"
            required
            maxLength={160}
            placeholder="Farm the last Necramech part"
          />
        </label>
        <label>
          Notes
          <textarea
            name="notes"
            maxLength={4000}
            rows={3}
            placeholder="Optional context, build link, or checklist"
          />
        </label>
        <label>
          Due date
          <input name="dueDate" type="date" />
        </label>
        <label>
          Repeat
          <select name="recurrenceKind" defaultValue="">
            <option value="">Does not repeat</option>
            <option value="days">Every N days</option>
            <option value="weekly">Weekly on this weekday</option>
            <option value="monthly-date">Monthly on this date</option>
            <option value="monthly-weekday">
              Monthly on this weekday occurrence
            </option>
            <option value="yearly">Yearly on this date</option>
          </select>
        </label>
        <label>
          Day interval (for “Every N days”)
          <input
            name="recurrenceInterval"
            type="number"
            min="1"
            max="3650"
            step="1"
            defaultValue="1"
          />
        </label>
        <button className="button">Add task</button>
      </form>
      <TodoSection title="Open" todos={open} />
      {completed.length > 0 && (
        <TodoSection title="Completed" todos={completed} />
      )}
    </section>
  );
}

function TodoSection({ title, todos }: { title: string; todos: PlayerTodo[] }) {
  return (
    <section className="planner-section">
      <h3>{title}</h3>
      {todos.length ? (
        <div className="todo-list">
          {todos.map((todo) => (
            <article className={`card todo-card ${todo.status}`} key={todo.id}>
              <div>
                <h3>{todo.title}</h3>
                {todo.entity && (
                  <p>
                    <Link
                      href={
                        todo.entity.kind === "node"
                          ? `/nodes/${todo.entity.slug}`
                          : `/catalog/${todo.entity.kind}/${todo.entity.slug}`
                      }
                    >
                      {todo.entity.name}
                    </Link>
                  </p>
                )}
                {todo.notes && <p className="muted todo-notes">{todo.notes}</p>}
                {todo.dueAt !== undefined && (
                  <p className="todo-due">Due {formatDate(todo.dueAt)}</p>
                )}
                {todo.recurrence && (
                  <p className="muted">{describeRecurrence(todo.recurrence)}</p>
                )}
              </div>
              <div className="todo-actions">
                <form
                  action={changeTodoStatus.bind(
                    null,
                    todo.id,
                    todo.status === "open" ? "completed" : "open",
                  )}
                >
                  <button className="button">
                    {todo.status === "open" ? "Complete" : "Reopen"}
                  </button>
                </form>
                <form action={removeTodo.bind(null, todo.id)}>
                  <button className="nav-button danger-text">Delete</button>
                </form>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="notice">No {title.toLowerCase()} tasks.</p>
      )}
    </section>
  );
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(timestamp);
}

function describeRecurrence(recurrence: NonNullable<PlayerTodo["recurrence"]>) {
  const weekdays = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  switch (recurrence.kind) {
    case "days":
      return `Repeats every ${recurrence.interval} ${recurrence.interval === 1 ? "day" : "days"}`;
    case "weekly":
      return `Repeats weekly on ${weekdays[recurrence.weekday]}`;
    case "monthly-date":
      return `Repeats monthly on day ${recurrence.day} (or the month's final day)`;
    case "monthly-weekday":
      return `Repeats monthly on the ${recurrence.ordinal === -1 ? "last" : ["", "first", "second", "third", "fourth"][recurrence.ordinal]} ${weekdays[recurrence.weekday]}`;
    case "yearly":
      return `Repeats yearly on ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }).format(Date.UTC(2000, recurrence.month - 1, recurrence.day))}`;
  }
}
