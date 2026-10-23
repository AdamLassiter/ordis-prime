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
import { getWorkerQueueHealth, summarizeWorkerTasks } from "./worker-health";

export const dynamic = "force-dynamic";

const JOB_KINDS = ["refresh-world-state", "refresh-catalog-source"] as const;
const AUTOMATIC_SOURCES = [
  ...AUTOMATIC_CATALOG_SOURCE_IDS,
  "wfcd-worldstate",
] as const;

export default async function Sources({
  searchParams,
}: {
  searchParams: Promise<{
    jobHistoryKind?: string;
    jobHistorySource?: string;
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
  const historyKind = (JOB_KINDS as readonly string[]).includes(
    filters.jobHistoryKind ?? "",
  )
    ? (filters.jobHistoryKind as (typeof JOB_KINDS)[number])
    : undefined;
  const jobSources = AUTOMATIC_SOURCES.map((id) => ({
    id,
    name: sources.find((source) => source.id === id)?.name ?? id,
  }));
  const historySource = jobSources.some(
    ({ id }) => id === filters.jobHistorySource,
  )
    ? filters.jobHistorySource
    : undefined;
  const workerJobs = isAdmin ? listRecentJobs(database, { limit: 200 }) : [];
  const workerHealth = getWorkerQueueHealth(workerJobs);
  const tasks = summarizeWorkerTasks(workerJobs);
  const requestedTask =
    historyKind && historySource
      ? tasks.find(
          (task) =>
            task.kind === historyKind && task.sourceId === historySource,
        )
      : undefined;
  const jobs =
    isAdmin && requestedTask
      ? listRecentJobs(database, {
          limit: 200,
          kind: requestedTask.kind,
          sourceId: requestedTask.sourceId,
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
      <p className="eyebrow">Public provenance · administrator controls</p>
      <h1>Data sources and operations</h1>
      <p className="lede">
        Inspect active source versions, retrieval times, queued work, and
        unresolved identity conflicts.
      </p>
      <div className="control-deck">
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
              Queue work for the leased background worker. Existing queued work
              is brought forward instead of duplicated.
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
                ["warframe-wiki-enemies", "Wiki enemies and bosses"],
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
      </div>
      {isAdmin && (
        <section className="planner-section" id="worker-jobs">
          <h2>
            {requestedTask
              ? `${sourceName(requestedTask.sourceId, jobSources)} run history`
              : "Worker tasks"}
          </h2>
          {workerHealth.appearsInactive && (
            <div className="notice">
              <strong>Background worker appears offline.</strong>
              <p>
                {workerHealth.overdueUnclaimedCount} due job
                {workerHealth.overdueUnclaimedCount === 1
                  ? " is"
                  : "s are"}{" "}
                still waiting after the polling grace period. Start{" "}
                <code>pnpm data:worker</code>, or use <code>pnpm dev</code> to
                launch the worker with the web app.
              </p>
            </div>
          )}
          {requestedTask ? (
            <>
              <p>
                <Link className="nav-button" href="/data-sources#worker-jobs">
                  ← Return to task overview
                </Link>
              </p>
              {jobs.length ? (
                <div className="operations">
                  {jobs.map((job) => (
                    <WorkerRunCard job={job} key={job.id} />
                  ))}
                </div>
              ) : (
                <p className="notice">No retained runs exist for this task.</p>
              )}
            </>
          ) : tasks.length ? (
            <div className="operations">
              {tasks.map((task) => (
                <article className="card" key={task.key}>
                  <JobStatus status={task.displayedRun.status} />
                  <h3>{sourceName(task.sourceId, jobSources)}</h3>
                  <p className="muted">
                    <code>{task.kind}</code>
                  </p>
                  <RunDetails job={task.displayedRun} />
                  <p>
                    <Link
                      className="nav-button"
                      href={jobHistoryHref(task.kind, task.sourceId)}
                    >
                      Show run history
                    </Link>
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="notice">No worker tasks have been scheduled yet.</p>
          )}
        </section>
      )}
      {sources.length ? (
        <section className="grid">
          {sources.map((source) => (
            <article className="card" key={source.id}>
              <h2>
                {isAdmin ? (
                  <Link href={`/data-sources/${source.id}`}>{source.name}</Link>
                ) : (
                  source.name
                )}
              </h2>
              <p>
                <a href={source.homepage}>Upstream source</a>
              </p>
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
        <p className="lede">No data sources are active yet.</p>
      )}
    </>
  );
}

function previewCount(value: string | undefined): number {
  return value && /^\d{1,9}$/.test(value) ? Number(value) : 0;
}

function WorkerRunCard({
  job,
}: {
  job: ReturnType<typeof listRecentJobs>[number];
}) {
  return (
    <article className="card">
      <JobStatus status={job.status} />
      <h3>{job.kind}</h3>
      <RunDetails job={job} />
    </article>
  );
}

function JobStatus({
  status,
}: {
  status: ReturnType<typeof listRecentJobs>[number]["status"];
}) {
  return (
    <span className={`tag ${status === "failed" ? "danger" : ""}`}>
      {status}
    </span>
  );
}

function RunDetails({
  job,
}: {
  job: ReturnType<typeof listRecentJobs>[number];
}) {
  return (
    <>
      <p>Scheduled {new Date(job.runAfter).toISOString()}</p>
      {job.leaseOwner && (
        <p className="muted">
          Lease {job.leaseOwner}
          {job.leaseUntil
            ? ` until ${new Date(job.leaseUntil).toISOString()}`
            : ""}
        </p>
      )}
      {job.error && <pre className="error-block">{job.error}</pre>}
    </>
  );
}

function sourceName(
  sourceId: string,
  sources: Array<{ id: string; name: string }>,
): string {
  return sources.find((source) => source.id === sourceId)?.name ?? sourceId;
}

function jobHistoryHref(kind: string, sourceId: string): string {
  const query = new URLSearchParams({
    jobHistoryKind: kind,
    jobHistorySource: sourceId,
  });
  return `/data-sources?${query}#worker-jobs`;
}
