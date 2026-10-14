import { notFound } from "next/navigation";
import { listLocalAccounts } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import { changeAccountRole } from "./actions";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const session = await getCurrentSession();
  if (session?.user.role !== "admin") notFound();
  const accounts = listLocalAccounts(getDatabase());
  const adminCount = accounts.filter(({ role }) => role === "admin").length;
  return <>
    <p className="eyebrow">Administrator</p>
    <h1>Local accounts</h1>
    <p className="lede">Promote or demote local users. Every role change invalidates that account&apos;s sessions so new permissions take effect on the next sign-in.</p>
    <section className="operations">{accounts.map((account) => <article className="card" key={account.id}>
      <span className="tag">{account.role}</span><h2>{account.username}</h2><p>{account.email}</p>
      <p className="muted">Created {new Date(account.createdAt).toISOString()} · {account.activeSessions} active {account.activeSessions === 1 ? "session" : "sessions"}</p>
      {account.role === "player"
        ? <form action={changeAccountRole.bind(null, account.id, "admin")}><button className="nav-button">Promote to administrator</button></form>
        : <form action={changeAccountRole.bind(null, account.id, "player")}><button className="nav-button danger-text" disabled={adminCount === 1}>Demote to player</button>{adminCount === 1 && <p className="muted">The final administrator cannot be demoted.</p>}</form>}
    </article>)}</section>
  </>;
}
