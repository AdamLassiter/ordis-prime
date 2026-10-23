import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  BUILD_ENHANCEMENT_SLOTS,
  BUILD_PANEL_KEYS,
  getPlayerBuild,
  listBuildShares,
  searchBuildCandidates,
  searchBuildEnhancementCandidates,
  searchBuildFocusSchools,
  searchBuildModularPartCandidates,
  searchHelminthAbilities,
  type BuildEnhancementSlot,
  type BuildPanelKey,
  type BuildSlot,
} from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import {
  cloneBuild,
  planBuildAcquisition,
  removeBuild,
  revokeShare,
  saveBuildDetails,
  shareBuild,
} from "../actions";
import { ArsenalLayout } from "../arsenal-layout";
import { BuildDetailsEditor } from "../build-details-editor";

export const dynamic = "force-dynamic";

export default async function BuildEditor({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    slot?: string;
    q?: string;
    position?: string;
    modq?: string;
    modularq?: string;
    modularrole?: string;
    enhancementslot?: string;
    enhancementq?: string;
    focusq?: string;
    original?: string;
    helminthq?: string;
  }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");
  const { id } = await params;
  const query = await searchParams;
  const database = getDatabase();
  const build = getPlayerBuild(database, session.user.id, id);
  if (!build) notFound();
  const selectedPanel = isBuildPanel(query.slot) ? query.slot : "warframe";
  const equipmentSlot = panelEquipmentSlot(selectedPanel);
  const equipment = build.equipment.find(({ slot }) => slot === equipmentSlot);
  const position = /^\d+$/.test(query.position ?? "")
    ? Number(query.position)
    : undefined;
  const enhancementSlot = isBuildEnhancementSlot(query.enhancementslot)
    ? query.enhancementslot
    : undefined;
  const modularRole = equipment?.modularPartRoles.find(
    (role) => role === query.modularrole,
  );
  const abilities = equipment?.abilities ?? [];
  const originalAbility =
    abilities.find(({ slug }) => slug === query.original) ?? abilities[0];
  const shares = listBuildShares(database, session.user.id, id);

  return (
    <>
      <p className="eyebrow">Private build · Draft {build.revision}</p>
      <p>
        <Link className="muted" href="/builds">
          ← All builds
        </Link>
      </p>
      <BuildDetailsEditor
        action={saveBuildDetails.bind(null, id)}
        title={build.title}
        category={build.category}
        notes={build.notes}
      />
      <ArsenalLayout
        build={build}
        buildId={id}
        selectedPanel={selectedPanel}
        basePath={`/builds/${id}`}
        search={{
          equipmentQuery: query.q,
          equipmentCandidates: query.q
            ? searchBuildCandidates(database, equipmentSlot, query.q)
            : [],
          modQuery: query.modq,
          modPosition: position,
          modCandidates: query.modq
            ? searchBuildCandidates(database, "mod", query.modq)
            : [],
          modularQuery: query.modularq,
          modularRole,
          modularCandidates:
            query.modularq && modularRole
              ? searchBuildModularPartCandidates(
                  database,
                  id,
                  equipmentSlot,
                  modularRole,
                  query.modularq,
                )
              : [],
          enhancementQuery: query.enhancementq,
          enhancementSlot,
          enhancementCandidates:
            query.enhancementq && enhancementSlot
              ? searchBuildEnhancementCandidates(
                  database,
                  enhancementSlot,
                  query.enhancementq,
                  id,
                )
              : [],
          focusQuery: query.focusq,
          focusCandidates: query.focusq
            ? searchBuildFocusSchools(database, query.focusq)
            : [],
          helminthQuery: query.helminthq,
          helminthOriginal: originalAbility,
          helminthCandidates: query.helminthq
            ? searchHelminthAbilities(database, query.helminthq)
            : [],
        }}
      />
      <section className="arsenal-secondary-grid">
        <section className="card" id="build-acquisition">
          <h2>Acquisition</h2>
          <p className="muted">
            Add unowned build components to the planner without reducing
            existing goals.
          </p>
          <form action={planBuildAcquisition.bind(null, id)}>
            <button className="button">Plan missing build items</button>
          </form>
        </section>
      </section>
      <section className="planner-section" id="build-sharing">
        <h2>Share history</h2>
        {shares.length ? (
          <div className="todo-list">
            {shares.map((share) => (
              <article className="card todo-card" key={share.shareKey}>
                <div>
                  <h3>
                    <Link href={`/builds/shared/${share.shareKey}`}>
                      Revision {share.revision}
                    </Link>
                  </h3>
                  <p className="muted">
                    Published {formatInstant(share.createdAt)}
                  </p>
                </div>
                <form action={revokeShare.bind(null, id, share.shareKey)}>
                  <button className="nav-button danger-text">Revoke</button>
                </form>
              </article>
            ))}
          </div>
        ) : (
          <p className="notice">No published snapshots yet.</p>
        )}
      </section>
      <section className="build-publish">
        <form action={shareBuild.bind(null, id)}>
          <button className="button">Publish immutable snapshot</button>
        </form>
        <form action={cloneBuild.bind(null, id)}>
          <button className="nav-button">Clone draft</button>
        </form>
        <form action={removeBuild.bind(null, id)}>
          <button className="nav-button danger-text">Delete draft</button>
        </form>
      </section>
    </>
  );
}

function isBuildPanel(value: string | undefined): value is BuildPanelKey {
  return (BUILD_PANEL_KEYS as readonly string[]).includes(value ?? "");
}

function isBuildEnhancementSlot(
  value: string | undefined,
): value is BuildEnhancementSlot {
  return (BUILD_ENHANCEMENT_SLOTS as readonly string[]).includes(value ?? "");
}

function panelEquipmentSlot(panel: BuildPanelKey): BuildSlot {
  return panel === "operator" ? "operator-amp" : panel;
}

function formatInstant(timestamp: number): string {
  return `${new Date(timestamp).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
