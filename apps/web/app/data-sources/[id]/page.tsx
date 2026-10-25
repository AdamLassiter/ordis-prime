import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getSourceRefreshMetrics,
  listIdentityOverrides,
  listSourceConflicts,
  listSourceRefreshes,
  listSourceStatuses,
} from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import {
  bindConflictIdentity,
  markConflictReviewed,
  reopenConflict,
  revokeIdentityOverride,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function SourceOperationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  if (session?.user.role !== "admin") notFound();
  const { id } = await params;
  const database = getDatabase();
  const source = listSourceStatuses(database).find((entry) => entry.id === id);
  if (!source) notFound();
  const refreshes = listSourceRefreshes(database, id);
  const metrics = getSourceRefreshMetrics(database, id);
  const conflicts = listSourceConflicts(database, id);
  const overrides = listIdentityOverrides(database, id);
  return (
    <>
      <p className="eyebrow">{source.name} · Administrator source operations</p>
      <p className="lede">
        Review refresh attempts, retained snapshots, and identity conflicts for
        this source.
      </p>
      <p className="notice">
        A review note closes a conflict without changing identity. A candidate
        binding persists an explicit external-ID override; automatic sources are
        queued for replay, while manual sources must be imported again.
      </p>
      <p>
        <a href={source.homepage}>Upstream source</a> ·{" "}
        <Link href="/data-sources">All sources</Link>
      </p>
      {source.observationCount != null && (
        <p className="notice">
          The active run contains {source.observationCount.toLocaleString()}{" "}
          normalized observations. Automatic shrinkage policy compares new
          candidates with this baseline before promotion.
        </p>
      )}

      <section className="planner-section">
        <h2>Recent refreshes</h2>
        <p className="muted">
          {metrics.attempts} attempts · {metrics.succeeded} succeeded ·{" "}
          {metrics.failed} failed · {metrics.recordsProcessed.toLocaleString()}{" "}
          records processed
          {metrics.averageDurationMilliseconds === undefined
            ? ""
            : ` · ${(metrics.averageDurationMilliseconds / 1000).toFixed(2)}s average`}
          {metrics.recordsPerSecond === undefined
            ? ""
            : ` · ${metrics.recordsPerSecond.toFixed(1)} records/s`}
        </p>
        {refreshes.length ? (
          <div className="operations">
            {refreshes.map((refresh) => (
              <article className="card" key={refresh.id}>
                <span
                  className={`tag ${refresh.status === "failed" ? "danger" : ""}`}
                >
                  {refresh.status}
                </span>
                <p>
                  Started {new Date(refresh.startedAt).toISOString()}
                  {refresh.finishedAt
                    ? ` · finished ${new Date(refresh.finishedAt).toISOString()}`
                    : ""}
                </p>
                {refresh.recordsProcessed !== undefined && (
                  <p>
                    {refresh.recordsProcessed.toLocaleString()} records
                    {refresh.finishedAt
                      ? ` · ${((refresh.finishedAt - refresh.startedAt) / 1000).toFixed(2)}s`
                      : ""}
                    {refresh.finishedAt &&
                    refresh.finishedAt > refresh.startedAt
                      ? ` · ${((refresh.recordsProcessed * 1000) / (refresh.finishedAt - refresh.startedAt)).toFixed(1)} records/s`
                      : ""}
                  </p>
                )}
                {refresh.version && (
                  <p>
                    Version <code>{refresh.version}</code>
                  </p>
                )}
                {refresh.snapshotPath && (
                  <p className="muted">
                    Snapshot <code>{refresh.snapshotPath}</code>
                  </p>
                )}
                {refresh.error && (
                  <pre className="error-block">{refresh.error}</pre>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="notice">
            No refresh has been attempted through the tracked pipeline.
          </p>
        )}
      </section>

      <section className="planner-section">
        <h2>Active identity overrides</h2>
        {overrides.length ? (
          <div className="operations">
            {overrides.map((override) => (
              <article
                className="card"
                key={`${override.externalId.sourceId}:${override.externalId.namespace}:${override.externalId.value}`}
              >
                <p>
                  <code>
                    {override.externalId.sourceId}:
                    {override.externalId.namespace}:{override.externalId.value}
                  </code>{" "}
                  →{" "}
                  <Link
                    href={`/catalog/${override.entity.kind}/${override.entity.slug}`}
                  >
                    {override.entity.name}
                  </Link>
                </p>
                <p className="muted">
                  Bound by {override.actor} at{" "}
                  {new Date(override.createdAt).toISOString()}: {override.note}
                </p>
                <form
                  className="form-stack compact-form"
                  action={revokeIdentityOverride.bind(null, id)}
                >
                  <input
                    type="hidden"
                    name="externalId"
                    value={JSON.stringify(override.externalId)}
                  />
                  <label>
                    Reason to revoke
                    <textarea
                      name="note"
                      required
                      minLength={1}
                      maxLength={2000}
                      rows={2}
                    />
                  </label>
                  <button className="nav-button danger-text">
                    Revoke override
                  </button>
                </form>
              </article>
            ))}
          </div>
        ) : (
          <p className="notice">
            No active identity overrides for this source.
          </p>
        )}
      </section>

      <section className="planner-section">
        <h2>Resolver conflicts</h2>
        {conflicts.length ? (
          <div className="operations">
            {conflicts.map((conflict) => (
              <article className="card" key={conflict.id}>
                <span className="tag">
                  {conflict.resolvedAt ? "reviewed" : "unresolved"}
                </span>
                <h3>
                  <code>{conflict.recordKey}</code>
                </h3>
                <p>{conflict.reason}</p>
                <p className="muted">
                  Source version <code>{conflict.version}</code>
                  {conflict.snapshotPath ? (
                    <>
                      {" "}
                      · snapshot <code>{conflict.snapshotPath}</code>
                    </>
                  ) : null}
                </p>
                {conflict.externalIds.length > 0 && (
                  <p className="muted">
                    External IDs:{" "}
                    {conflict.externalIds
                      .map(
                        (externalId) =>
                          `${externalId.sourceId}:${externalId.namespace}:${externalId.value}`,
                      )
                      .join(", ")}
                  </p>
                )}
                {conflict.candidateEntities.length > 0 && (
                  <p className="muted">
                    Candidates:{" "}
                    {conflict.candidateEntities.map((candidate, index) => (
                      <span key={candidate.id}>
                        {index ? ", " : ""}
                        <Link
                          href={`/catalog/${candidate.kind}/${candidate.slug}`}
                        >
                          {candidate.name}
                        </Link>
                      </span>
                    ))}
                  </p>
                )}
                {conflict.reviewEvents.length > 0 && (
                  <details>
                    <summary>
                      Review history ({conflict.reviewEvents.length})
                    </summary>
                    <ul>
                      {conflict.reviewEvents.map((event) => (
                        <li key={event.id}>
                          <strong>{event.action}</strong> by {event.actor} at{" "}
                          {new Date(event.createdAt).toISOString()}:{" "}
                          {event.note}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {conflict.resolvedAt ? (
                  <form
                    className="form-stack compact-form"
                    action={reopenConflict.bind(null, id, conflict.id)}
                  >
                    <label>
                      Reason to reopen
                      <textarea
                        name="note"
                        required
                        minLength={1}
                        maxLength={2000}
                        rows={2}
                      />
                    </label>
                    <button className="nav-button">Reopen conflict</button>
                  </form>
                ) : (
                  <>
                    <form
                      className="form-stack compact-form"
                      action={markConflictReviewed.bind(null, id, conflict.id)}
                    >
                      <label>
                        Review note
                        <textarea
                          name="note"
                          required
                          minLength={1}
                          maxLength={2000}
                          rows={2}
                          placeholder="Why no catalog change is required"
                        />
                      </label>
                      <button className="nav-button">Mark reviewed</button>
                    </form>
                    {conflict.externalIds.length > 0 &&
                      conflict.candidateEntities.length > 0 && (
                        <form
                          className="form-stack compact-form"
                          action={bindConflictIdentity.bind(
                            null,
                            id,
                            conflict.id,
                          )}
                        >
                          <label>
                            External ID
                            <select name="externalId" required>
                              {conflict.externalIds.map((externalId) => (
                                <option
                                  key={`${externalId.sourceId}:${externalId.namespace}:${externalId.value}`}
                                  value={JSON.stringify(externalId)}
                                >
                                  {externalId.sourceId}:{externalId.namespace}:
                                  {externalId.value}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Canonical entity
                            <select name="entityId" required>
                              {conflict.candidateEntities.map((candidate) => (
                                <option value={candidate.id} key={candidate.id}>
                                  {candidate.name} ({candidate.kind})
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Binding evidence
                            <textarea
                              name="note"
                              required
                              minLength={1}
                              maxLength={2000}
                              rows={2}
                              placeholder="Why these identities are the same"
                            />
                          </label>
                          <button className="button">
                            Bind identity and replay
                          </button>
                        </form>
                      )}
                  </>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="notice">
            No conflicts have been recorded for this source.
          </p>
        )}
      </section>
    </>
  );
}
