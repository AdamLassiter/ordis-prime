import Link from "next/link";
import { redirect } from "next/navigation";
import { buildAcquisitionPlan, findLiveAcquisitionOpportunities } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import { GoalForm } from "./goal-form";

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
    return <><p className="eyebrow">Private workspace</p><h1>Acquisition planner</h1><p className="error">The plan could not be expanded: {error instanceof Error ? error.message : "unknown catalog error"}</p></>;
  }
  return <>
    <p className="eyebrow">Private workspace</p>
    <h1>Acquisition planner</h1>
    <p className="lede">Set desired final quantities. Your inventory is subtracted before recipes are expanded, and every candidate node explains which missing requirements it covers.</p>

    {opportunities.length > 0 && <section className="planner-section"><h2>Live opportunities</h2><p className="muted">Current or upcoming world-state windows on nodes that drop something this plan still needs.</p><div className="grid">{opportunities.map((opportunity) => <article className="card" key={`${opportunity.kind}:${opportunity.externalId}`}><span className="tag">{opportunity.status}</span><h3>{opportunity.label}</h3><p><Link href={`/nodes/${opportunity.nodeSlug}`}>{opportunity.nodeLabel}</Link></p><p>{opportunity.neededRewards.map(({ name, quantity }) => `${name} × ${quantity}`).join(" · ")}</p>{opportunity.expiry && <p className="muted">Ends {formatInstant(opportunity.expiry)}</p>}</article>)}</div></section>}

    <section className="planner-section">
      <h2>Goals</h2>
      {plan.goals.length ? <div className="grid">{plan.goals.map((goal) => <article className="card" key={goal.entityId}>
        <span className="tag">{goal.kind}</span><h3><Link href={`/catalog/${goal.kind}/${goal.slug}`}>{goal.name}</Link></h3>
        <GoalForm kind={goal.kind} slug={goal.slug} targetQuantity={goal.targetQuantity} compact />
      </article>)}</div> : <p className="notice">No goals yet. <Link href="/">Find an item</Link> and add it from its catalog page.</p>}
    </section>

    {plan.goals.length > 0 && <section className="planner-section">
      <h2>Still required</h2>
      {plan.missing.length ? <ul className="requirement-list">{plan.missing.map((item) => <li key={item.entityId}><Link href={`/catalog/${item.kind}/${item.slug}`}>{item.name}</Link><strong>{item.quantity}</strong></li>)}</ul> : <p className="success">Your recorded inventory satisfies every goal.</p>}
    </section>}

    {plan.missing.length > 0 && <section className="planner-section">
      <h2>Candidate nodes</h2>
      <p className="muted">Ordered by how many different missing items a node covers. Chance is displayed as evidence, not converted into a time estimate.</p>
      {plan.recommendations.length ? <div className="grid">{plan.recommendations.map((recommendation) => <article className="card" key={`${recommendation.nodeId ?? "label"}:${recommendation.locationLabel}`}>
        <h3>{recommendation.nodeSlug ? <Link href={`/nodes/${recommendation.nodeSlug}`}>{recommendation.locationLabel}</Link> : recommendation.locationLabel}</h3>
        <ul>{recommendation.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      </article>)}</div> : <p className="notice">No active drop source is linked to the remaining requirements.</p>}
    </section>}
  </>;
}

function formatInstant(timestamp: number): string { return `${new Date(timestamp).toISOString().slice(0, 16).replace("T", " ")} UTC`; }
