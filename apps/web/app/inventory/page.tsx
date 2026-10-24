import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlayerSettings, listPlayerInventory } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import { ProfileTransfer } from "./profile-transfer";
import { updateProgression } from "./actions";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");
  const database = getDatabase();
  const entries = listPlayerInventory(database, session.user.id);
  const settings = getPlayerSettings(database, session.user.id);
  return (
    <>
      <p className="eyebrow">Private player data</p>
      <h1>Inventory and progression</h1>
      <p className="lede">
        Record owned and built equipment so plans, routes, and builds can use
        your current collection.
      </p>
      <div className="control-deck">
        <section className="card">
          <h2>Progression</h2>
          <p className="muted">
            Your combined rank is used for documented star-chart gates and build
            capacity; enter 31 for Legendary Rank 1, 32 for Legendary Rank 2,
            and so on. Railjack access uses the highest rank you have reached in
            any Railjack Intrinsics category. Only one adversary can be active;
            choose None to record that explicitly, or leave it unknown. The
            highest available Warframe rank is used only for node rules that
            require a currently usable ranked Warframe.
          </p>
          <form className="form-stack compact-form" action={updateProgression}>
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
            <label>
              Highest Railjack Intrinsic Rank
              <input
                name="railjackIntrinsicRank"
                type="number"
                min="0"
                max="10"
                defaultValue={settings.railjackIntrinsicRank}
                placeholder="Not recorded"
              />
            </label>
            <label>
              Active adversary
              <select
                name="activeAdversary"
                defaultValue={settings.activeAdversary ?? ""}
              >
                <option value="">Not recorded</option>
                <option value="none">None</option>
                <option value="kuva-lich">Kuva Lich</option>
                <option value="sister-of-parvos">Sister of Parvos</option>
                <option value="technocyte-coda">Technocyte Coda</option>
              </select>
            </label>
            <label>
              Highest available Warframe rank
              <input
                name="highestWarframeRank"
                type="number"
                min="0"
                max="30"
                defaultValue={settings.highestWarframeRank}
                placeholder="Not recorded"
              />
            </label>
            <button className="button">Save progression</button>
          </form>
        </section>
        <ProfileTransfer />
      </div>
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
    </>
  );
}
