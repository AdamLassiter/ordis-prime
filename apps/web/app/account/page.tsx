import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { deleteOwnAccount } from "./actions";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");
  return (
    <>
      <p className="eyebrow">Private workspace</p>
      <h1>My account</h1>
      <section className="card build-details">
        <h2>{session.user.name}</h2>
        <p>{session.user.email}</p>
        <span className="tag">{session.user.role}</span>
      </section>
      <section className="card build-details">
        <h2>Delete account</h2>
        <p className="muted">
          This permanently removes your inventory, goals, todos, watches,
          builds, discovery progress, credentials and sessions. Published build
          links are revoked. This cannot be undone.
        </p>
        {session.user.role === "admin" && (
          <p className="notice">
            The final administrator cannot delete their account. Promote another
            account first.
          </p>
        )}
        <form className="form-stack compact-form" action={deleteOwnAccount}>
          <label>
            Current password
            <input
              name="password"
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete="current-password"
            />
          </label>
          <label>
            Type DELETE to confirm
            <input
              name="confirmation"
              required
              pattern="DELETE"
              autoComplete="off"
            />
          </label>
          <button className="button danger-text">Delete my account</button>
        </form>
      </section>
    </>
  );
}
