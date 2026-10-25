import { redirect } from "next/navigation";
import { getPlayerPreferences } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import { deleteOwnAccount, updateInterfacePreferences } from "./actions";
import { PlayerDataImport } from "./player-data-import";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ preferences?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");
  const query = await searchParams;
  const preferences = getPlayerPreferences(getDatabase(), session.user.id);
  return (
    <>
      <p className="eyebrow">Operator · private account</p>
      <section className="card build-details">
        <h2>{session.user.name}</h2>
        <p>{session.user.email}</p>
        <span className="tag">{session.user.role}</span>
      </section>
      <section className="card build-details">
        <h2>Interface preferences</h2>
        {query.preferences === "saved" && (
          <p className="notice" role="status">
            Interface preferences saved.
          </p>
        )}
        <p className="muted">
          These private preferences apply to supported collection views and are
          included in profile exports. Status remains labeled even when visual
          emphasis is reduced.
        </p>
        <form
          className="form-stack compact-form"
          action={updateInterfacePreferences}
        >
          <label>
            Collection layout
            <select
              name="collectionLayout"
              defaultValue={preferences.collectionLayout}
            >
              <option value="cards">Cards</option>
              <option value="table">Table</option>
            </select>
          </label>
          <label>
            Display density
            <select
              name="displayDensity"
              defaultValue={preferences.displayDensity}
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </label>
          <label>
            Collection-state highlighting
            <select
              name="collectionHighlighting"
              defaultValue={preferences.collectionHighlighting}
            >
              <option value="badges">Labeled badges</option>
              <option value="emphasis">Badges with stronger emphasis</option>
              <option value="minimal">Minimal labeled indicators</option>
            </select>
          </label>
          <button className="button">Save interface preferences</button>
        </form>
      </section>
      <PlayerDataImport />
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
          <button className="button danger-button">Delete my account</button>
        </form>
      </section>
    </>
  );
}
