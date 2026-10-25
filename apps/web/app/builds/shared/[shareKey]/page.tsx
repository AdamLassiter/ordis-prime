import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BUILD_PANEL_KEYS,
  findSharedBuild,
  type BuildPanelKey,
} from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import { ArsenalLayout } from "../../arsenal-layout";
import { cloneSharedBuildToDraft } from "../../actions";

export const dynamic = "force-dynamic";

export default async function SharedBuildPage({
  params,
  searchParams,
}: {
  params: Promise<{ shareKey: string }>;
  searchParams: Promise<{ slot?: string; published?: string }>;
}) {
  const { shareKey } = await params;
  const query = await searchParams;
  const build = findSharedBuild(getDatabase(), shareKey);
  if (!build) notFound();
  const session = await getCurrentSession();
  const selectedPanel = isBuildPanel(query.slot) ? query.slot : "warframe";
  return (
    <>
      <p className="eyebrow">
        {build.title} · Shared build · Revision {build.revision}
      </p>
      {query.published === "1" && (
        <p className="notice" role="status">
          Build published. This read-only version now appears in the public
          Builds directory.
        </p>
      )}
      {build.category && <span className="tag">{build.category}</span>}
      {build.notes && <p className="lede build-notes">{build.notes}</p>}
      <p className="muted">
        Read-only version published {formatInstant(build.sharedAt)}
      </p>
      {session ? (
        <form action={cloneSharedBuildToDraft.bind(null, shareKey)}>
          <button className="button">Clone to my drafts</button>
        </form>
      ) : (
        <p className="notice">
          <Link href="/sign-in">Sign in</Link> to clone this snapshot into an
          editable private draft.
        </p>
      )}
      <ArsenalLayout
        build={build}
        selectedPanel={selectedPanel}
        basePath={`/builds/shared/${shareKey}`}
      />
    </>
  );
}

function isBuildPanel(value: string | undefined): value is BuildPanelKey {
  return (BUILD_PANEL_KEYS as readonly string[]).includes(value ?? "");
}

function formatInstant(timestamp: number): string {
  return `${new Date(timestamp).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
