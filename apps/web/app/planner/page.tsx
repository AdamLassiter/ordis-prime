import Link from "next/link";
import { ADVERSARY_LABELS, deriveCollectionState } from "@ordis-prime/domain";
import { redirect } from "next/navigation";
import {
  buildAcquisitionPlan,
  findLiveAcquisitionOpportunities,
  listPlayerTodos,
  listPlayerInventory,
} from "@ordis-prime/db";
import type { PlayerInventoryEntry } from "@ordis-prime/db";
import { CollectionStateIndicators } from "@/app/collection-state-indicators";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import { GoalForm } from "./goal-form";
import { chooseRecipe } from "./actions";
import { TaskManager } from "./task-manager";

export const dynamic = "force-dynamic";

export default async function Planner() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");
  const database = getDatabase();
  const todos = listPlayerTodos(database, session.user.id);
  const inventory = new Map(
    listPlayerInventory(database, session.user.id).map(
      (entry) => [entry.entityId, entry] as const,
    ),
  );
  let plan;
  let opportunities;
  try {
    plan = buildAcquisitionPlan(database, session.user.id);
    opportunities = findLiveAcquisitionOpportunities(database, plan);
  } catch (error) {
    return (
      <>
        <p className="eyebrow">
          Planner · private player data · sourced recipes
        </p>
        <p className="error">
          The plan could not be expanded:{" "}
          {error instanceof Error ? error.message : "unknown catalog error"}
        </p>
        <TaskManager todos={todos} />
      </>
    );
  }
  return (
    <>
      <p className="eyebrow">Planner · private player data · sourced recipes</p>
      <p className="lede">
        Expand item goals into required materials and identify missions that
        provide what your inventory still lacks.
      </p>
      <TaskManager todos={todos} />

      {opportunities.length > 0 && (
        <section className="planner-section">
          <h2>Live opportunities</h2>
          <p className="muted">
            Current or upcoming world-state windows on nodes that drop something
            this plan still needs.
          </p>
          <div className="grid">
            {opportunities.map((opportunity) => (
              <article
                className="card"
                key={`${opportunity.kind}:${opportunity.externalId}`}
              >
                <span className="tag">{opportunity.status}</span>
                <h3>{opportunity.label}</h3>
                <p>
                  <Link href={`/nodes/${opportunity.nodeSlug}`}>
                    {opportunity.nodeLabel}
                  </Link>
                </p>
                <p>
                  {opportunity.neededRewards
                    .map(({ name, quantity }) => `${name} × ${quantity}`)
                    .join(" · ")}
                </p>
                {opportunity.expiry && (
                  <p className="muted">
                    Ends {formatInstant(opportunity.expiry)}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {plan.rotatingRewards.length > 0 && (
        <section className="planner-section">
          <h2>Circuit acquisition windows</h2>
          <p className="muted">
            Weekly reward paths that can satisfy something this plan still
            needs.
          </p>
          <div className="grid">
            {plan.rotatingRewards.map((entry) => (
              <article
                className="card"
                key={`${entry.scheduleKey}:${entry.phaseLabel}:${entry.reward.entityId}`}
              >
                <span className="tag">{entry.status}</span>
                <h3>
                  <Link
                    href={`/catalog/${entry.reward.kind}/${entry.reward.slug}`}
                  >
                    {entry.reward.name} × {entry.reward.quantity}
                  </Link>
                </h3>
                <PlannerCollectionState
                  item={entry.reward}
                  inventory={inventory}
                />
                <p>
                  <Link href="/world-state">{entry.scheduleLabel}</Link> ·{" "}
                  {entry.phaseLabel}
                </p>
                {entry.startsAt && (
                  <p className="muted">
                    {entry.status === "active" ? "Started" : "Starts"}{" "}
                    {formatInstant(entry.startsAt)}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="planner-section">
        <h2>Goals</h2>
        {plan.goals.length ? (
          <div className="grid">
            {plan.goals.map((goal) => (
              <article className="card" key={goal.entityId}>
                <span className="tag">{goal.kind}</span>
                <h3>
                  <Link href={`/catalog/${goal.kind}/${goal.slug}`}>
                    {goal.name}
                  </Link>
                </h3>
                <PlannerCollectionState
                  item={{ ...goal, quantity: goal.targetQuantity }}
                  inventory={inventory}
                />
                <GoalForm
                  kind={goal.kind}
                  slug={goal.slug}
                  targetQuantity={goal.targetQuantity}
                  compact
                />
              </article>
            ))}
          </div>
        ) : (
          <p className="notice">
            No goals yet. <Link href="/">Find an item</Link> and add it from its
            catalog page.
          </p>
        )}
      </section>

      {plan.goals.length > 0 && (
        <section className="planner-section">
          <h2>Still required</h2>
          {plan.missing.length ? (
            <ul className="requirement-list">
              {plan.missing.map((item) => (
                <li key={item.entityId}>
                  <Link href={`/catalog/${item.kind}/${item.slug}`}>
                    {item.name}
                  </Link>
                  <strong>{item.quantity}</strong>
                  <PlannerCollectionState item={item} inventory={inventory} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="success">
              Your recorded inventory satisfies every goal.
            </p>
          )}
        </section>
      )}

      {plan.recipeChoices.length > 0 && (
        <section className="planner-section">
          <h2>Recipe choices</h2>
          <p className="muted">
            Choose which active recipe the planner expands for each output. The
            highest-priority current source is used until you choose.
          </p>
          <div className="grid">
            {plan.recipeChoices.map((choice) => (
              <article className="card" key={choice.output.entityId}>
                <h3>
                  <Link
                    href={`/catalog/${choice.output.kind}/${choice.output.slug}`}
                  >
                    {choice.output.name}
                  </Link>
                </h3>
                {!choice.preferredAvailable && (
                  <p className="notice">
                    Your saved recipe is unavailable; the current fallback is
                    selected.
                  </p>
                )}
                <div className="form-stack">
                  {choice.options.map((option) => (
                    <form
                      action={chooseRecipe.bind(
                        null,
                        choice.output.kind,
                        choice.output.slug,
                        option.recipeId,
                      )}
                      key={option.recipeId}
                    >
                      <p>
                        <strong>{option.sourceName}</strong>
                        {option.sourceRecordKey ? (
                          <>
                            {" "}
                            · <code>{option.sourceRecordKey}</code>
                          </>
                        ) : (
                          ""
                        )}
                      </p>
                      <p className="muted">
                        Makes {option.outputQuantity} from{" "}
                        {option.ingredients
                          .map(({ name, quantity }) => `${quantity} × ${name}`)
                          .join(" + ")}
                      </p>
                      <button
                        className={option.selected ? "button" : "nav-button"}
                        disabled={option.selected || !option.sourceRecordKey}
                      >
                        {option.selected
                          ? "Used in plan"
                          : option.sourceRecordKey
                            ? "Use this recipe"
                            : "No stable recipe key"}
                      </button>
                    </form>
                  ))}
                </div>
                <form
                  action={chooseRecipe.bind(
                    null,
                    choice.output.kind,
                    choice.output.slug,
                    "",
                  )}
                >
                  <button className="nav-button">
                    Use automatic source priority
                  </button>
                </form>
              </article>
            ))}
          </div>
        </section>
      )}

      {plan.missing.length > 0 && (
        <section className="planner-section">
          <h2>One-time acquisition options</h2>
          <p className="muted">
            Cited Junction grants that satisfy a missing requirement. These are
            not repeatable drops and do not affect candidate-node scoring.
          </p>
          {plan.oneTimeGrants.length ? (
            <div className="grid">
              {plan.oneTimeGrants.map((grant) => (
                <article
                  className="card"
                  key={`${grant.nodeSlug}:${grant.rewardEntityId}:${grant.label}`}
                >
                  <span className="tag">one-time grant</span>
                  <h3>
                    <Link href={`/nodes/${grant.nodeSlug}`}>
                      {grant.nodeName}
                    </Link>
                  </h3>
                  <p>
                    <Link href={`/catalog/${grant.kind}/${grant.slug}`}>
                      {grant.label}
                    </Link>
                  </p>
                  <p>
                    Need {grant.neededQuantity}
                    {grant.grantQuantity === undefined
                      ? ""
                      : ` · grants ${grant.grantQuantity}`}
                    {grant.trigger === "junction-completion"
                      ? " · on Junction completion"
                      : " · from a Junction objective"}
                  </p>
                  <p className="muted">
                    Source:{" "}
                    {grant.source.citationUrl ? (
                      <a href={grant.source.citationUrl}>{grant.source.name}</a>
                    ) : (
                      grant.source.name
                    )}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="notice">
              No linked one-time grant covers a remaining requirement.
            </p>
          )}
        </section>
      )}

      {plan.missing.length > 0 && (
        <section className="planner-section">
          <h2>Candidate nodes</h2>
          <p className="muted">
            Documented accessible nodes come first, followed by conditional,
            unknown, and blocked nodes. Each group is ordered by missing-item
            coverage. Chance is evidence, not a time estimate.
          </p>
          {plan.recommendations.length ? (
            <div className="grid">
              {plan.recommendations.map((recommendation) => (
                <article
                  className="card"
                  key={`${recommendation.nodeId ?? "label"}:${recommendation.locationLabel}`}
                >
                  <span className="tag">
                    access {recommendation.accessStatus}
                  </span>
                  <h3>
                    {recommendation.nodeSlug ? (
                      <Link href={`/nodes/${recommendation.nodeSlug}`}>
                        {recommendation.locationLabel}
                      </Link>
                    ) : (
                      recommendation.locationLabel
                    )}
                  </h3>
                  <ul>
                    {recommendation.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  {recommendation.accessStatus === "unknown" ? (
                    <p className="muted">
                      No active source documents access requirements for this
                      node.
                    </p>
                  ) : (
                    <>
                      <p>
                        <strong>
                          {recommendation.accessStatus === "available"
                            ? "Documented requirements completed"
                            : recommendation.accessStatus === "conditional"
                              ? "Documented condition"
                              : "Documented blockers"}
                        </strong>
                      </p>
                      {recommendation.masteryRequirement && (
                        <p>
                          Mastery Rank{" "}
                          {recommendation.masteryRequirement.required}:{" "}
                          {recommendation.masteryRequirement.state === "met"
                            ? "met"
                            : recommendation.masteryRequirement.state ===
                                "blocked"
                              ? `blocked at your rank ${recommendation.masteryRequirement.playerRank}`
                              : "your rank is not recorded"}{" "}
                          <span className="muted">
                            (
                            {recommendation.masteryRequirement.source
                              .citationUrl ? (
                              <a
                                href={
                                  recommendation.masteryRequirement.source
                                    .citationUrl
                                }
                                rel="noreferrer"
                              >
                                {recommendation.masteryRequirement.source.name}
                              </a>
                            ) : (
                              recommendation.masteryRequirement.source.name
                            )}
                            )
                          </span>
                        </p>
                      )}
                      {recommendation.railjackIntrinsicRequirement && (
                        <p>
                          Highest Railjack Intrinsic Rank{" "}
                          {recommendation.railjackIntrinsicRequirement.required}
                          :{" "}
                          {recommendation.railjackIntrinsicRequirement.state ===
                          "met"
                            ? "met"
                            : recommendation.railjackIntrinsicRequirement
                                  .state === "blocked"
                              ? `blocked at your rank ${recommendation.railjackIntrinsicRequirement.playerRank}`
                              : "your rank is not recorded"}{" "}
                          <span className="muted">
                            (
                            {recommendation.railjackIntrinsicRequirement.source
                              .citationUrl ? (
                              <a
                                href={
                                  recommendation.railjackIntrinsicRequirement
                                    .source.citationUrl
                                }
                                rel="noreferrer"
                              >
                                {
                                  recommendation.railjackIntrinsicRequirement
                                    .source.name
                                }
                              </a>
                            ) : (
                              recommendation.railjackIntrinsicRequirement.source
                                .name
                            )}
                            )
                          </span>
                        </p>
                      )}
                      {recommendation.activeAdversaryRequirement && (
                        <p>
                          Active{" "}
                          {
                            ADVERSARY_LABELS[
                              recommendation.activeAdversaryRequirement.required
                            ]
                          }
                          :{" "}
                          {recommendation.activeAdversaryRequirement.state ===
                          "met"
                            ? "met"
                            : recommendation.activeAdversaryRequirement
                                  .state === "unknown"
                              ? "your active adversary is not recorded"
                              : recommendation.activeAdversaryRequirement
                                    .playerValue === "none"
                                ? "blocked with no active adversary"
                                : `blocked with ${ADVERSARY_LABELS[recommendation.activeAdversaryRequirement.playerValue!]}`}{" "}
                          <span className="muted">
                            (
                            {recommendation.activeAdversaryRequirement.source
                              .citationUrl ? (
                              <a
                                href={
                                  recommendation.activeAdversaryRequirement
                                    .source.citationUrl
                                }
                                rel="noreferrer"
                              >
                                {
                                  recommendation.activeAdversaryRequirement
                                    .source.name
                                }
                              </a>
                            ) : (
                              recommendation.activeAdversaryRequirement.source
                                .name
                            )}
                            )
                          </span>
                        </p>
                      )}
                      {recommendation.warframeRankRequirement && (
                        <p>
                          Available Warframe Rank{" "}
                          {recommendation.warframeRankRequirement.required}:{" "}
                          {recommendation.warframeRankRequirement.state ===
                          "met"
                            ? "met"
                            : recommendation.warframeRankRequirement.state ===
                                "blocked"
                              ? `blocked at your rank ${recommendation.warframeRankRequirement.playerRank}`
                              : "your available Warframe rank is not recorded"}{" "}
                          <span className="muted">
                            (
                            {recommendation.warframeRankRequirement.source
                              .citationUrl ? (
                              <a
                                href={
                                  recommendation.warframeRankRequirement.source
                                    .citationUrl
                                }
                                rel="noreferrer"
                              >
                                {
                                  recommendation.warframeRankRequirement.source
                                    .name
                                }
                              </a>
                            ) : (
                              recommendation.warframeRankRequirement.source.name
                            )}
                            )
                          </span>
                        </p>
                      )}
                      {recommendation.itemRequirements.length > 0 && (
                        <ul>
                          {recommendation.itemRequirements.map(
                            (requirement) => (
                              <li key={requirement.entityId}>
                                Requires {requirement.requiredCount} ×{" "}
                                <Link
                                  href={`/catalog/${requirement.kind}/${requirement.slug}`}
                                >
                                  {requirement.name}
                                </Link>
                                :{" "}
                                {requirement.state === "met"
                                  ? "met"
                                  : "blocked"}
                                {` at ${requirement.ownedCount} owned`}{" "}
                                <span className="muted">
                                  (
                                  {requirement.source.citationUrl ? (
                                    <a
                                      href={requirement.source.citationUrl}
                                      rel="noreferrer"
                                    >
                                      {requirement.source.name}
                                    </a>
                                  ) : (
                                    requirement.source.name
                                  )}
                                  )
                                </span>
                              </li>
                            ),
                          )}
                        </ul>
                      )}
                      {recommendation.objectives.length > 0 && (
                        <ul>
                          {recommendation.objectives.map((objective) => (
                            <li key={`${objective.sourceId}:${objective.key}`}>
                              {objective.label}: {objective.state}{" "}
                              <span className="muted">
                                (
                                {objective.source.citationUrl ? (
                                  <a
                                    href={objective.source.citationUrl}
                                    rel="noreferrer"
                                  >
                                    {objective.source.name}
                                  </a>
                                ) : (
                                  objective.source.name
                                )}
                                )
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {recommendation.accessRequirements.length > 0 && (
                        <ul>
                          {recommendation.accessRequirements.map(
                            (requirement) => (
                              <li key={requirement.entityId}>
                                <Link
                                  href={
                                    requirement.kind === "node"
                                      ? `/nodes/${requirement.slug}`
                                      : `/catalog/${requirement.kind}/${requirement.slug}`
                                  }
                                >
                                  {requirement.name}
                                </Link>
                                : {requirement.state}{" "}
                                <span className="muted">
                                  (
                                  {requirement.sources.map((source, index) => (
                                    <span
                                      key={`${source.name}:${source.citationUrl ?? index}`}
                                    >
                                      {index > 0 ? ", " : ""}
                                      {source.citationUrl ? (
                                        <a
                                          href={source.citationUrl}
                                          rel="noreferrer"
                                        >
                                          {source.name}
                                        </a>
                                      ) : (
                                        source.name
                                      )}
                                    </span>
                                  ))}
                                  )
                                </span>
                              </li>
                            ),
                          )}
                        </ul>
                      )}
                    </>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="notice">
              No active drop source is linked to the remaining requirements.
            </p>
          )}
        </section>
      )}
    </>
  );
}

function PlannerCollectionState({
  item,
  inventory,
}: {
  item: { entityId: string; kind: string; quantity: number };
  inventory: Map<string, PlayerInventoryEntry>;
}) {
  const recorded = inventory.get(item.entityId);
  const values = recorded ?? {
    kind: item.kind,
    ownedCount: 0,
    builtCount: 0,
    wantedCount: 0,
  };
  return (
    <CollectionStateIndicators
      {...deriveCollectionState({
        ...values,
        goalRequiredCount: item.quantity,
      })}
      mastered={recorded?.mastered}
      ownedCount={recorded?.ownedCount}
      builtCount={recorded?.builtCount}
      wantedCount={recorded?.wantedCount}
      compact
    />
  );
}

function formatInstant(timestamp: number): string {
  return `${new Date(timestamp).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
