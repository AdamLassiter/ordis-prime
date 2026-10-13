import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BUILD_SLOTS, getPlayerBuild, searchBuildCandidates, type BuildSlot } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import { assignEquipment, assignMod, clearEquipment, clearMod, removeBuild, saveBuildDetails, saveEquipmentConfiguration, saveEquipmentNotes, shareBuild } from "../actions";

export const dynamic = "force-dynamic";

export default async function BuildEditor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; slot?: string; modq?: string; modslot?: string; position?: string }> }) {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");
  const { id } = await params;
  const query = await searchParams;
  const database = getDatabase();
  const build = getPlayerBuild(database, session.user.id, id);
  if (!build) notFound();
  const selectedSlot = isBuildSlot(query.slot) ? query.slot : "warframe";
  const modSlot = isBuildSlot(query.modslot) ? query.modslot : build.equipment[0]?.slot;
  const position = /^\d+$/.test(query.position ?? "") ? Math.min(19, Number(query.position)) : 0;
  const equipmentCandidates = query.q ? searchBuildCandidates(database, selectedSlot, query.q) : [];
  const modCandidates = query.modq && modSlot ? searchBuildCandidates(database, "mod", query.modq) : [];
  return <>
    <p className="eyebrow">Build draft · revision {build.revision}</p><h1>{build.title}</h1>
    <p><Link className="muted" href="/builds">← All builds</Link></p>
    <form className="card form-stack build-details" action={saveBuildDetails.bind(null, id)}>
      <label>Title<input name="title" required maxLength={160} defaultValue={build.title} /></label>
      <label>Category<input name="category" maxLength={80} defaultValue={build.category} /></label>
      <label>Notes<textarea name="notes" maxLength={10000} rows={5} defaultValue={build.notes} /></label>
      <button className="button">Save details</button>
    </form>
    <section className="planner-section"><h2>Loadout</h2>
      <div className="build-slots">{BUILD_SLOTS.map((slot) => {
        const equipment = build.equipment.find((entry) => entry.slot === slot);
        return <article className="card build-slot" key={slot}><span className="tag">{slot}</span>{equipment ? <>
          <h3><Link href={`/catalog/${equipment.entity.kind}/${equipment.entity.slug}`}>{equipment.entity.name}</Link></h3>
          <form className="form-stack compact-form" action={saveEquipmentConfiguration.bind(null, id, slot)}><label>Configuration<input name="configuration" maxLength={120} defaultValue={equipment.configuration} placeholder="e.g. Config A, Incarnon" /></label><div className="count-grid"><label>Forma<input name="formaCount" type="number" min="0" max="100" step="1" required defaultValue={equipment.formaCount} /></label><label className="check-label"><input name="capacityUpgrade" type="checkbox" value="yes" defaultChecked={equipment.capacityUpgrade} /> Orokin capacity upgrade</label></div><button className="nav-button">Save configuration</button></form>
          <form className="form-stack compact-form" action={saveEquipmentNotes.bind(null, id, slot, equipment.entity.kind, equipment.entity.slug)}><label>Slot notes<textarea name="notes" rows={2} maxLength={2000} defaultValue={equipment.notes} /></label><button className="nav-button">Save notes</button></form>
          {equipment.mods.length > 0 && <ol className="mod-list">{equipment.mods.map((mod) => <li key={mod.position}><Link href={`/catalog/${mod.entity.kind}/${mod.entity.slug}`}>{mod.entity.name}</Link>{mod.rank === undefined ? "" : ` · rank ${mod.rank}`}<form action={clearMod.bind(null, id, slot, mod.position)}><button className="nav-button danger-text">Remove</button></form></li>)}</ol>}
          <form action={clearEquipment.bind(null, id, slot)}><button className="nav-button danger-text">Clear slot</button></form>
        </> : <p className="muted">Empty</p>}</article>;
      })}</div>
    </section>
    <section className="planner-section"><h2>Find equipment</h2>
      <form className="inline-form"><label>Slot<select name="slot" defaultValue={selectedSlot}>{BUILD_SLOTS.map((slot) => <option key={slot}>{slot}</option>)}</select></label><label>Search<input name="q" defaultValue={query.q} required /></label><button className="button">Search</button></form>
      {equipmentCandidates.length > 0 && <div className="candidate-list">{equipmentCandidates.map((item) => <form action={assignEquipment.bind(null, id, selectedSlot, item.kind, item.slug)} key={`${item.kind}:${item.slug}`}><span>{item.name}</span><button className="button">Assign</button></form>)}</div>}
    </section>
    <section className="planner-section"><h2>Find mods</h2>
      {build.equipment.length ? <><form className="inline-form"><label>Equipment<select name="modslot" defaultValue={modSlot}>{build.equipment.map(({ slot, entity }) => <option value={slot} key={slot}>{slot}: {entity.name}</option>)}</select></label><label>Position<input name="position" type="number" min="0" max="19" defaultValue={position} required /></label><label>Search<input name="modq" defaultValue={query.modq} required /></label><button className="button">Search</button></form>
      {modCandidates.length > 0 && modSlot && <div className="candidate-list">{modCandidates.map((item) => <form action={assignMod.bind(null, id, modSlot, position, item.kind, item.slug)} key={`${item.kind}:${item.slug}`}><span>{item.name}</span><label>Rank<input name="rank" type="number" min="0" max="100" /></label><button className="button">Assign</button></form>)}</div>}</> : <p className="notice">Assign equipment before adding mods.</p>}
    </section>
    <section className="build-publish"><form action={shareBuild.bind(null, id)}><button className="button">Publish immutable snapshot</button></form><form action={removeBuild.bind(null, id)}><button className="nav-button danger-text">Delete draft</button></form></section>
  </>;
}

function isBuildSlot(value: string | undefined): value is BuildSlot { return (BUILD_SLOTS as readonly string[]).includes(value ?? ""); }
