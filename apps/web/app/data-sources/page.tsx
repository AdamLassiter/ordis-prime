import {
  getActiveCatalogRelease,
  listRecentJobs,
  listSourceStatuses,
} from "@ordis-prime/db";
import { AUTOMATIC_CATALOG_SOURCE_IDS } from "@ordis-prime/ingestion";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import Link from "next/link";
import {
  importManualSource,
  previewManualSource,
  queueSourceRefresh,
} from "./actions";

export const dynamic = "force-dynamic";

const JOB_KINDS = ["refresh-world-state", "refresh-catalog-source"] as const;
const JOB_STATUSES = ["queued", "running", "succeeded", "failed"] as const;
const AUTOMATIC_SOURCES = [
  ...AUTOMATIC_CATALOG_SOURCE_IDS,
  "wfcd-worldstate",
] as const;

export default async function Sources({
  searchParams,
}: {
  searchParams: Promise<{
    jobKind?: string;
    jobStatus?: string;
    jobSource?: string;
    previewSource?: string;
    previewObservations?: string;
    previewEntities?: string;
    previewRecipes?: string;
    previewDrops?: string;
    previewRelations?: string;
    previewOptions?: string;
    previewRankings?: string;
    previewConflicts?: string;
  }>;
}) {
  const filters = await searchParams;
  const database = getDatabase();
  const sources = listSourceStatuses(database);
  const release = getActiveCatalogRelease(database);
  const session = await getCurrentSession();
  const isAdmin = session?.user.role === "admin";
  const jobKind = (JOB_KINDS as readonly string[]).includes(
    filters.jobKind ?? "",
  )
    ? (filters.jobKind as (typeof JOB_KINDS)[number])
    : undefined;
  const jobStatus = (JOB_STATUSES as readonly string[]).includes(
    filters.jobStatus ?? "",
  )
    ? (filters.jobStatus as (typeof JOB_STATUSES)[number])
    : undefined;
  const jobSources = AUTOMATIC_SOURCES.map((id) => ({
    id,
    name: sources.find((source) => source.id === id)?.name ?? id,
  }));
  const jobSource = jobSources.some(({ id }) => id === filters.jobSource)
    ? filters.jobSource
    : undefined;
  const jobs = isAdmin
    ? listRecentJobs(database, {
        limit: 30,
        kind: jobKind,
        status: jobStatus,
        sourceId: jobSource,
      })
    : [];
  const preview =
    filters.previewSource && filters.previewSource.length <= 200
      ? {
          source: filters.previewSource,
          observations: previewCount(filters.previewObservations),
          entities: previewCount(filters.previewEntities),
          recipes: previewCount(filters.previewRecipes),
          drops: previewCount(filters.previewDrops),
          relations: previewCount(filters.previewRelations),
          options: previewCount(filters.previewOptions),
          rankings: previewCount(filters.previewRankings),
          conflicts: previewCount(filters.previewConflicts),
        }
      : undefined;
  return (
    <>
      <p className="eyebrow">Trust and provenance</p>
      <h1>Data sources</h1>
      <p className="lede">
        Providers contribute evidence. They do not silently become application
        truth.
      </p>
      {release && (
        <section className="card source-controls">
          <h2>Active catalog release</h2>
          <p>
            <code>{release.id}</code> · promoted{" "}
            {new Date(release.promotedAt).toISOString()}
          </p>
          <div className="filters">
            {release.sources.map((member) => (
              <span className="tag" key={member.sourceId}>
                {member.sourceName}: {member.version}
              </span>
            ))}
          </div>
        </section>
      )}
      {isAdmin && (
        <section className="card source-controls">
          <h2>Refresh controls</h2>
          <p className="muted">
            Queue work for the leased background worker. Existing queued work is
            brought forward instead of duplicated.
          </p>
          <div className="filters">
            {[
              ["wfcd-items", "WFCD items"],
              ["wfcd-drops", "WFCD drops"],
              ["warframe-wiki-weapons", "Wiki weapons"],
              ["warframe-wiki-warframes", "Wiki Warframes"],
              ["warframe-wiki-missions", "Wiki missions"],
              ["warframe-wiki-junctions", "Wiki Junction tasks"],
              ["warframe-wiki-abilities", "Wiki abilities"],
              ["warframe-wiki-quests", "Wiki quests"],
              ["wfcd-worldstate", "World state"],
            ].map(([id, label]) => (
              <form action={queueSourceRefresh.bind(null, id!)} key={id}>
                <button className="button">Queue {label}</button>
              </form>
            ))}
          </div>
        </section>
      )}
      {isAdmin && (
        <section className="card source-controls">
          <h2>Import cited manual data</h2>
          <p className="muted">
            Preview runs the exact validation and resolver transaction, then
            rolls it back without retaining a snapshot. Import revalidates the
            selected file and promotes it. Maximum 1 MB.
          </p>
          {preview && (
            <div className={preview.conflicts ? "notice" : "success"}>
              <strong>Dry run: {preview.source}</strong>
              <p>
                {preview.observations} observations · {preview.entities}{" "}
                entities matched/created · {preview.recipes} recipes ·{" "}
                {preview.drops} drops · {preview.relations} relations ·{" "}
                {preview.options} enhancement options · {preview.rankings}{" "}
                ranking records · {preview.conflicts} conflicts
              </p>
              <p>
                Select the file again to import; preview results are
                informational and are not retained.
              </p>
            </div>
          )}
          <form className="inline-form" action={importManualSource}>
            <label>
              Document type
              <select name="type" defaultValue="ranking">
                <option value="ranking">Editorial ranking</option>
                <option value="discovery">Discovery facts</option>
                <option value="facts">Factual overlay</option>
              </select>
            </label>
            <label>
              YAML file
              <input
                name="file"
                type="file"
                accept=".yaml,.yml,application/yaml,text/yaml"
                required
              />
            </label>
            <button className="nav-button" formAction={previewManualSource}>
              Preview dry run
            </button>
            <button className="button">Validate and import</button>
          </form>
        </section>
      )}
      {isAdmin && (
        <section className="planner-section">
          <h2>Recent worker jobs</h2>
          <form className="inline-form">
            <label>
              Kind
              <select name="jobKind" defaultValue={jobKind ?? ""}>
                <option value="">All kinds</option>
                {JOB_KINDS.map((kind) => (
                  <option key={kind}>{kind}</option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select name="jobStatus" defaultValue={jobStatus ?? ""}>
                <option value="">All statuses</option>
                {JOB_STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <label>
              Source
              <select name="jobSource" defaultValue={jobSource ?? ""}>
                <option value="">All sources</option>
                {jobSources.map((source) => (
                  <option value={source.id} key={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="nav-button">Filter jobs</button>
          </form>
          {jobs.length ? (
            <div className="operations">
              {jobs.map((job) => (
                <article className="card" key={job.id}>
                  <span
                    className={`tag ${job.status === "failed" ? "danger" : ""}`}
                  >
                    {job.status}
                  </span>
                  <h3>{job.kind}</h3>
                  <p>
                    Source{" "}
                    <code>
                      {typeof job.payload.source === "string"
                        ? job.payload.source
                        : "unknown"}
                    </code>{" "}
                    · due {new Date(job.runAfter).toISOString()}
                  </p>
                  {job.leaseOwner && (
                    <p className="muted">
                      Lease {job.leaseOwner}
                      {job.leaseUntil
                        ? ` until ${new Date(job.leaseUntil).toISOString()}`
                        : ""}
                    </p>
                  )}
                  {job.error && <pre className="error-block">{job.error}</pre>}
                </article>
              ))}
            </div>
          ) : (
            <p className="notice">No worker jobs match these filters.</p>
          )}
        </section>
      )}
      {sources.length ? (
        <section className="grid">
          {sources.map((source) => (
            <article className="card" key={source.id}>
              <h2>
                <a href={source.homepage}>{source.name}</a>
              </h2>
              <p>
                {source.version ? (
                  <>
                    Active snapshot <code>{source.version}</code>
                  </>
                ) : (
                  "No active snapshot"
                )}
              </p>
              {source.retrievedAt && (
                <p className="muted">
                  Retrieved {new Date(source.retrievedAt).toISOString()}
                </p>
              )}
              {source.observationCount != null && (
                <p className="muted">
                  Active baseline: {source.observationCount.toLocaleString()}{" "}
                  normalized observations
                </p>
              )}
              <span className="tag">
                {source.license ?? "Licence not recorded"}
              </span>{" "}
              <span className="tag">
                {source.conflictCount} unresolved conflicts
              </span>
              {source.latestRefreshStatus && (
                <p
                  className={
                    source.latestRefreshStatus === "failed" ? "error" : "muted"
                  }
                >
                  Latest refresh: {source.latestRefreshStatus}
                  {source.latestRefreshStartedAt
                    ? ` at ${new Date(source.latestRefreshStartedAt).toISOString()}`
                    : ""}
                </p>
              )}
              {isAdmin && (
                <p>
                  <Link className="button" href={`/data-sources/${source.id}`}>
                    Inspect operations
                  </Link>
                </p>
              )}
            </article>
          ))}
        </section>
      ) : (
        <p className="lede">No sources have been imported yet.</p>
      )}
    </>
  );
}

function previewCount(value: string | undefined): number {
  return value && /^\d{1,9}$/.test(value) ? Number(value) : 0;
}
