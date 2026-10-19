import Link from "next/link";
import { redirect } from "next/navigation";
import {
  buildAcquisitionPlan,
  findLiveAcquisitionOpportunities,
} from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import { GoalForm } from "./goal-form";
import { chooseRecipe } from "./actions";

export const dynamic = "force-dynamic";

export default async function Planner() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");
  let plan;
  let opportunities;
  try {
    const database = getDatabase();
    plan = buildAcquisitionPlan(database, session.user.id);
    opportunities = findLiveAcquisitionOpportunities(database, plan);
  } catch (error) {
    return (
      <>
        <p className="eyebrow">Private workspace</p>
        <h1>
          Acquisition <u>planner</u>
        </h1>
        <p className="error">
          The plan could not be expanded:{" "}
          {error instanceof Error ? error.message : "unknown catalog error"}
        </p>
      </>
    );
  }
  return (
    <>
      <p className="eyebrow">Private workspace</p>
      <h1>
        Acquisition <u>planner</u>
      </h1>
      <p className="lede">
        Set desired final quantities. Your inventory is subtracted before
        recipes are expanded, and every candidate node explains which missing
        requirements it covers.
      </p>

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

function formatInstant(timestamp: number): string {
  return `${new Date(timestamp).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
