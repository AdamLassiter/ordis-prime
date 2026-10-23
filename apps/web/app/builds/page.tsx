import Link from "next/link";
import { redirect } from "next/navigation";
import { listPlayerBuilds } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import { addBuild } from "./actions";

export const dynamic = "force-dynamic";

export default async function BuildsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");
  const builds = listPlayerBuilds(getDatabase(), session.user.id);
  return (
    <>
      <p className="eyebrow">Private player data</p>
      <h1>Arsenal builds</h1>
      <p className="lede">
        Configure complete loadouts with mods and enhancements, then publish an
        immutable snapshot when a build is ready to share.
      </p>
      <div className="page-workspace">
        <form className="card form-stack build-create" action={addBuild}>
          <h2>New build</h2>
          <label>
            Title
            <input
              name="title"
              maxLength={160}
              required
              placeholder="Steel Path Mesa"
            />
          </label>
          <label>
            Category
            <input
              name="category"
              maxLength={80}
              placeholder="Steel Path, farming, beginner…"
            />
          </label>
          <label>
            Notes
            <textarea name="notes" maxLength={10000} rows={4} />
          </label>
          <button className="button">Create build</button>
        </form>
        <section className="workspace-main">
          <h2>Your drafts</h2>
          {builds.length ? (
            <div className="grid compact-grid">
              {builds.map((build) => (
                <Link
                  className="card"
                  href={`/builds/${build.id}`}
                  key={build.id}
                >
                  {build.category && (
                    <span className="tag">{build.category}</span>
                  )}
                  <h3>{build.title}</h3>
                  <p className="muted">
                    Revision {build.revision} · {build.equipment.length}{" "}
                    equipped slots
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="notice">No builds yet.</p>
          )}
        </section>
      </div>
    </>
  );
}
