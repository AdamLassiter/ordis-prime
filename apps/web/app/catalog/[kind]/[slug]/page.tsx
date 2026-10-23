import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import {
  DISCOVERY_KINDS,
  findPlayerInventoryEntry,
  getDiscoveryProgress,
  listPlayerGoals,
  listPlayerTodos,
  listWorldStateWatches,
} from "@ordis-prime/db";
import { findItem } from "@/lib/catalog";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import { relationLabel } from "@/lib/relation-label";
import { InventoryForm } from "./inventory-form";
import { GoalForm } from "@/app/planner/goal-form";
import { DiscoveryProgressForm } from "@/app/discovery/progress-form";
import { addCatalogTodo, addCatalogWatch } from "@/app/todos/actions";

export default async function ItemPage({
  params,
}: {
  params: Promise<{ kind: string; slug: string }>;
}) {
  const { kind, slug } = await params;
  const item = await findItem(kind, slug);
  if (!item) notFound();
  const session = await getCurrentSession();
  const database = getDatabase();
  const inventory = session
    ? findPlayerInventoryEntry(database, session.user.id, kind, slug)
    : undefined;
  const goal = session
    ? listPlayerGoals(database, session.user.id).find(
        (entry) => entry.entityId === inventory?.entityId,
      )
    : undefined;
  const openTodo = session
    ? listPlayerTodos(database, session.user.id).find(
        (todo) =>
          todo.status === "open" &&
          todo.entity?.kind === kind &&
          todo.entity.slug === slug,
      )
    : undefined;
  const linkedWatch = session
    ? listWorldStateWatches(database, session.user.id).find(
        (watch) => watch.entity?.kind === kind && watch.entity.slug === slug,
      )
    : undefined;
  const isDiscovery = (DISCOVERY_KINDS as readonly string[]).includes(kind);
  const discoveryProgress =
    session && isDiscovery
      ? getDiscoveryProgress(database, session.user.id, { kind, slug })
      : undefined;
  return (
    <>
      <p className="eyebrow">{item.kind}</p>
      <h1>{item.name}</h1>
      {item.description && <p className="lede">{item.description}</p>}
      <dl className="facts">
        {item.attributes.map((attribute) => (
          <Fragment key={attribute.key}>
            <dt>{attribute.label}</dt>
            <dd>
              {attribute.value}{" "}
              <span className="muted">
                (
                {attribute.citationUrl ? (
                  <a href={attribute.citationUrl}>{attribute.sourceName}</a>
                ) : (
                  attribute.sourceName
                )}
                )
              </span>
            </dd>
          </Fragment>
        ))}
        {item.arcaneClass && (
          <>
            <dt>Arcane class</dt>
            <dd>{item.arcaneClass}</dd>
          </>
        )}
        {item.weaponClass && (
          <>
            <dt>Weapon class</dt>
            <dd>{item.weaponClass}</dd>
          </>
        )}
        {item.modularPartRole && (
          <>
            <dt>Modular part role</dt>
            <dd>{formatModularPartRole(item.modularPartRole)}</dd>
          </>
        )}
        {item.modMaxRank !== undefined && (
          <>
            <dt>Maximum rank</dt>
            <dd>{item.modMaxRank}</dd>
          </>
        )}
        {item.equipmentMaxRank !== undefined && (
          <>
            <dt>Maximum equipment rank</dt>
            <dd>{item.equipmentMaxRank}</dd>
          </>
        )}
        {item.modBaseDrain !== undefined && (
          <>
            <dt>Base drain</dt>
            <dd>{item.modBaseDrain}</dd>
          </>
        )}
        {item.modPolarity && (
          <>
            <dt>Polarity</dt>
            <dd>{item.modPolarity}</dd>
          </>
        )}
        {item.factoryPolaritySets.length > 0 && (
          <>
            <dt>Factory polarities</dt>
            <dd>
              {item.factoryPolaritySets.map((set, index) => (
                <div
                  key={`${set.sourceName}:${set.configuration ?? "default"}:${index}`}
                >
                  {set.configuration ? `${set.configuration}: ` : ""}
                  {set.polarities.length
                    ? set.polarities
                        .map(
                          ({ role, polarity, quantity }) =>
                            `${quantity} × ${polarity} ${role}`,
                        )
                        .join(" · ")
                    : "No innate polarities"}{" "}
                  <span className="muted">
                    (
                    {set.citationUrl ? (
                      <a href={set.citationUrl}>{set.sourceName}</a>
                    ) : (
                      set.sourceName
                    )}
                    )
                  </span>
                </div>
              ))}
            </dd>
          </>
        )}
        <dt>Components</dt>
        <dd>
          {item.components.length
            ? item.components.map((component) => (
                <div key={`${component.kind}:${component.slug}`}>
                  <Link href={`/catalog/${component.kind}/${component.slug}`}>
                    {component.quantity} × {component.name}
                  </Link>
                </div>
              ))
            : "No crafting components recorded"}
        </dd>
        {item.usedInRecipes.length > 0 && (
          <>
            <dt>Used to build</dt>
            <dd>
              {item.usedInRecipes.map((recipe, recipeIndex) => (
                <div
                  className="catalog-recipe-context"
                  key={`${recipe.output.kind}:${recipe.output.slug}:${recipeIndex}`}
                >
                  <Link
                    href={`/catalog/${recipe.output.kind}/${recipe.output.slug}`}
                  >
                    {recipe.outputQuantity} × {recipe.output.name}
                  </Link>
                  {recipe.ingredients.length > 0 && (
                    <span className="muted">
                      {" "}
                      with{" "}
                      {recipe.ingredients.map((ingredient, index) => (
                        <Fragment
                          key={`${ingredient.kind}:${ingredient.slug}:${index}`}
                        >
                          {index > 0 ? " + " : ""}
                          <Link
                            href={`/catalog/${ingredient.kind}/${ingredient.slug}`}
                          >
                            {ingredient.quantity} × {ingredient.name}
                          </Link>
                        </Fragment>
                      ))}
                    </span>
                  )}
                </div>
              ))}
            </dd>
          </>
        )}
        <dt>Acquisition</dt>
        <dd>
          {item.drops.length
            ? item.drops.map((drop, index) => (
                <div
                  key={`${drop.nodeSlug ?? drop.node}:${drop.rotation ?? "none"}:${index}`}
                >
                  {drop.nodeSlug ? (
                    <Link href={`/nodes/${drop.nodeSlug}`}>{drop.node}</Link>
                  ) : (
                    drop.node
                  )}
                  {drop.chance === undefined
                    ? ""
                    : ` — ${(drop.chance * 100).toFixed(2)}%`}
                  {drop.rotation ? `, rotation ${drop.rotation}` : ""}
                </div>
              ))
            : "No node drop recorded"}
        </dd>
        {item.junctionRewards.length > 0 && (
          <>
            <dt>One-time Junction rewards</dt>
            <dd>
              {item.junctionRewards.map((reward, index) => (
                <div
                  key={`${reward.nodeSlug}:${reward.trigger}:${reward.label}:${index}`}
                >
                  <Link href={`/nodes/${reward.nodeSlug}`}>
                    {reward.nodeName}
                  </Link>
                  {` — ${reward.label}`}
                  {reward.trigger === "junction-completion"
                    ? " (on completion)"
                    : " (objective reward)"}{" "}
                  <span className="muted">
                    (
                    {reward.citationUrl ? (
                      <a href={reward.citationUrl}>{reward.sourceName}</a>
                    ) : (
                      reward.sourceName
                    )}
                    )
                  </span>
                </div>
              ))}
            </dd>
          </>
        )}
        <dt>Editorial rankings</dt>
        <dd>
          {item.rankings.length
            ? item.rankings.map((ranking) => (
                <div key={`${ranking.title}:${ranking.author}`}>
                  <Link
                    href={`/rankings?set=${encodeURIComponent(ranking.setId)}&sort=tier`}
                  >
                    {ranking.title}
                  </Link>{" "}
                  by {ranking.author}: <strong>{ranking.tier}</strong>
                  {ranking.timestampSeconds === undefined
                    ? ""
                    : ` at ${formatTimestamp(ranking.timestampSeconds)}`}
                  {" · "}
                  <a href={ranking.sourceUrl}>source</a>
                </div>
              ))
            : "No cited rankings recorded"}
        </dd>
        {item.requiredForNodeAccess.length > 0 && (
          <>
            <dt>Required for node access</dt>
            <dd>
              {item.requiredForNodeAccess.map((requirement) => (
                <div key={`${requirement.nodeSlug}:${requirement.sourceName}`}>
                  {requirement.quantity} × for{" "}
                  <Link href={`/nodes/${requirement.nodeSlug}`}>
                    {requirement.nodeName}
                  </Link>{" "}
                  <span className="muted">
                    (
                    {requirement.citationUrl ? (
                      <a href={requirement.citationUrl}>
                        {requirement.sourceName}
                      </a>
                    ) : (
                      requirement.sourceName
                    )}
                    )
                  </span>
                </div>
              ))}
            </dd>
          </>
        )}
        {item.enhancementOptions.length > 0 && (
          <>
            <dt>Selectable effects</dt>
            <dd>
              {item.enhancementOptions.map((option) => (
                <div key={option.key}>
                  {option.label}{" "}
                  <span className="muted">
                    (
                    {option.citationUrl ? (
                      <a href={option.citationUrl}>{option.sourceName}</a>
                    ) : (
                      option.sourceName
                    )}
                    )
                  </span>
                </div>
              ))}
            </dd>
          </>
        )}
        <dt>Related discoveries</dt>
        <dd>
          {item.relations.length
            ? item.relations.map((relation, index) => (
                <div
                  key={`${relation.direction}:${relation.kind}:${relation.subject.kind}:${relation.subject.slug}:${index}`}
                >
                  <span className="tag">
                    {relationLabel(relation.kind, relation.direction)}
                  </span>{" "}
                  <Link
                    href={
                      relation.subject.kind === "node"
                        ? `/nodes/${relation.subject.slug}`
                        : `/catalog/${relation.subject.kind}/${relation.subject.slug}`
                    }
                  >
                    {relation.subject.name}
                  </Link>
                  {relation.notes ? ` — ${relation.notes}` : ""}{" "}
                  <span className="muted">
                    (
                    {relation.citationUrl ? (
                      <a href={relation.citationUrl}>{relation.sourceName}</a>
                    ) : (
                      relation.sourceName
                    )}
                    )
                  </span>
                </div>
              ))
            : "No explicit relationships recorded"}
        </dd>
        <dt>Evidence</dt>
        <dd>
          {item.evidence.length
            ? item.evidence.map((evidence, index) => (
                <div
                  className="evidence"
                  key={`${evidence.fact}:${evidence.sourceName}:${evidence.recordKey ?? index}`}
                >
                  <span className="tag">{evidence.fact}</span>{" "}
                  {evidence.sourceName} <code>{evidence.version}</code>
                  {evidence.recordKey && (
                    <>
                      {" "}
                      · record <code>{evidence.recordKey}</code>
                    </>
                  )}
                  {evidence.sourcePath && (
                    <>
                      {" "}
                      · path <code>{evidence.sourcePath}</code>
                    </>
                  )}
                  {evidence.citationUrl && (
                    <>
                      {" "}
                      · <a href={evidence.citationUrl}>citation</a>
                    </>
                  )}
                </div>
              ))
            : "No active provenance recorded"}
        </dd>
      </dl>
      {discoveryProgress && (
        <section className="card">
          <h2>Your discovery progress</h2>
          <DiscoveryProgressForm
            kind={kind}
            slug={slug}
            state={discoveryProgress}
          />
        </section>
      )}
      {session && (
        <section className="card goal-editor">
          <h2>Todo</h2>
          {openTodo ? (
            <p>
              <Link href="/planner#tasks">Open task: {openTodo.title}</Link>
            </p>
          ) : (
            <form action={addCatalogTodo.bind(null, kind, slug)}>
              <button className="nav-button">Add to my todos</button>
            </form>
          )}
        </section>
      )}
      {session && (
        <section className="card goal-editor">
          <h2>World-state watch</h2>
          {linkedWatch ? (
            <p>
              <Link href="/todos">
                Edit the linked {linkedWatch.kind} watch
              </Link>
            </p>
          ) : (
            <>
              <p className="muted">
                Create an editable watch for live windows reconciled to this
                exact catalog entry.
              </p>
              <form action={addCatalogWatch.bind(null, kind, slug)}>
                <button className="nav-button">Watch for this item</button>
              </form>
            </>
          )}
        </section>
      )}
      {inventory ? (
        <>
          <InventoryForm item={inventory} />
          <section className="card goal-editor">
            <h2>Acquisition goal</h2>
            <p className="muted">
              Set the total number you want to own or build. The planner
              subtracts your recorded inventory.
            </p>
            <GoalForm
              kind={kind}
              slug={slug}
              targetQuantity={goal?.targetQuantity ?? 0}
            />
          </section>
        </>
      ) : (
        <p className="notice">
          <Link href="/sign-in">Sign in</Link> to track ownership and add
          acquisition goals.
        </p>
      )}
    </>
  );
}

function formatModularPartRole(role: string): string {
  return role
    .split("-")
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ");
}

function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
