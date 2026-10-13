import Link from "next/link";
import { notFound } from "next/navigation";
import { findSharedBuild } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";

export const dynamic = "force-dynamic";

export default async function SharedBuildPage({ params }: { params: Promise<{ shareKey: string }> }) {
  const { shareKey } = await params;
  const build = findSharedBuild(getDatabase(), shareKey);
  if (!build) notFound();
  return <>
    <p className="eyebrow">Shared build · revision {build.revision}</p><h1>{build.title}</h1>
    {build.category && <span className="tag">{build.category}</span>}
    {build.notes && <p className="lede build-notes">{build.notes}</p>}
    <p className="muted">Immutable snapshot published {formatInstant(build.sharedAt)}</p>
    <section className="planner-section"><h2>Loadout</h2><div className="build-slots">{build.equipment.map((equipment) => <article className="card build-slot" key={equipment.slot}>
      <span className="tag">{equipment.slot}</span><h3><Link href={`/catalog/${equipment.entity.kind}/${equipment.entity.slug}`}>{equipment.entity.name}</Link></h3>
      {equipment.notes && <p className="muted build-notes">{equipment.notes}</p>}
      {equipment.mods.length > 0 && <ol className="mod-list">{equipment.mods.map((mod) => <li key={mod.position}><Link href={`/catalog/${mod.entity.kind}/${mod.entity.slug}`}>{mod.entity.name}</Link>{mod.rank === undefined ? "" : ` · rank ${mod.rank}`}</li>)}</ol>}
    </article>)}</div></section>
  </>;
}

function formatInstant(timestamp: number): string { return `${new Date(timestamp).toISOString().slice(0, 16).replace("T", " ")} UTC`; }
