import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlayerSettings, listPlayerInventory } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import { ProfileTransfer } from "./profile-transfer";
import { updateMasteryRank } from "./actions";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");
  const database = getDatabase();
  const entries = listPlayerInventory(database, session.user.id);
  const settings = getPlayerSettings(database, session.user.id);
  return (
    <>
      <p className="eyebrow">Private collection</p>
      <h1>
        Your <u>inventory</u>
      </h1>
      <p className="lede">
        Recorded ownership, build, and wishlist state. Open an item to edit its
        details.
      </p>
      <section className="card">
        <h2>Progression</h2>
        <p className="muted">
          Your combined rank is used for documented star-chart gates and build
          capacity. Enter 31 for Legendary Rank 1, 32 for Legendary Rank 2, and
          so on.
        </p>
        <form className="form-stack compact-form" action={updateMasteryRank}>
          <label>
            Combined Mastery Rank
            <input
              name="masteryRank"
              type="number"
              min="0"
              max="40"
              defaultValue={settings.masteryRank}
              placeholder="Not recorded"
            />
          </label>
          <button className="button">Save progression</button>
        </form>
      </section>
      {entries.length ? (
        <section className="grid">
          {entries.map((entry) => (
            <Link
              className="card"
              href={`/catalog/${entry.kind}/${entry.slug}`}
              key={entry.entityId}
            >
              <span className="tag">{entry.kind}</span>
              <h2>{entry.name}</h2>
              <p>
                {entry.ownedCount} owned · {entry.builtCount} built ·{" "}
                {entry.wantedCount} wanted
              </p>
              {(entry.mastered !== undefined ||
                entry.subsumed !== undefined) && (
                <p className="muted">
                  {entry.mastered === true
                    ? "Mastered"
                    : entry.mastered === false
                      ? "Not mastered"
                      : "Mastery unknown"}
                  {entry.subsumed === true
                    ? " · Subsumed"
                    : entry.subsumed === false
                      ? " · Not subsumed"
                      : ""}
                </p>
              )}
            </Link>
          ))}
        </section>
      ) : (
        <p className="notice">
          Nothing is recorded yet. Find an item in the catalog to start tracking
          it.
        </p>
      )}
      <ProfileTransfer />
    </>
  );
}
