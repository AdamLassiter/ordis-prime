import Link from "next/link";
import {
  BUILD_MOD_SLOT_POLARITIES,
  BUILD_PANEL_KEYS,
  buildModSlotRoleAt,
  buildSlotProfile,
  type BuildAbility,
  type BuildCandidate,
  type BuildEnhancementSlot,
  type BuildEquipmentEntry,
  type BuildPanelKey,
  type BuildSlot,
  type PlayerBuild,
  type SharedBuildSnapshot,
} from "@ordis-prime/db";
import type { ModularPartRole } from "@ordis-prime/domain";
import {
  assignAbilityReplacement,
  assignEnhancement,
  assignEquipment,
  assignFocusSchool,
  assignMod,
  assignModularPart,
  clearAbilityReplacement,
  clearEnhancement,
  clearEquipment,
  clearFocusSchool,
  clearMod,
  clearModularPart,
  saveEquipmentConfiguration,
  saveEquipmentNotes,
  saveModSlot,
} from "./actions";
import { BuildCapacitySummary } from "./capacity-summary";
import { FactoryPolaritySummary } from "./factory-polarity-summary";
import { AutoSaveForm } from "../auto-save-form";
import { DebouncedSearchInput } from "../debounced-search-input";

const PANEL_LABELS: Record<BuildPanelKey, string> = {
  warframe: "Warframe",
  primary: "Primary",
  secondary: "Secondary",
  melee: "Melee",
  companion: "Companion",
  "companion-weapon": "Companion Weapon",
  archwing: "Archwing",
  archgun: "Archgun",
  archmelee: "Archwing Melee",
  operator: "Operator / Amp",
};

export interface ArsenalSearchState {
  equipmentQuery?: string;
  equipmentCandidates?: BuildCandidate[];
  modQuery?: string;
  modPosition?: number;
  modCandidates?: BuildCandidate[];
  modularQuery?: string;
  modularRole?: ModularPartRole;
  modularCandidates?: BuildCandidate[];
  enhancementQuery?: string;
  enhancementSlot?: BuildEnhancementSlot;
  enhancementCandidates?: BuildCandidate[];
  focusQuery?: string;
  focusCandidates?: BuildCandidate[];
  helminthQuery?: string;
  helminthOriginal?: BuildAbility;
  helminthCandidates?: BuildAbility[];
}

export function ArsenalLayout({
  build,
  selectedPanel,
  basePath,
  buildId,
  search = {},
}: {
  build: PlayerBuild | SharedBuildSnapshot;
  selectedPanel: BuildPanelKey;
  basePath: string;
  buildId?: string;
  search?: ArsenalSearchState;
}) {
  const editable = Boolean(buildId);
  const slot = panelEquipmentSlot(selectedPanel);
  const equipment = slot
    ? build.equipment.find((entry) => entry.slot === slot)
    : undefined;
  const heading =
    selectedPanel === "operator"
      ? (equipment?.entity.name ?? build.focusSchool?.name ?? "Operator / Amp")
      : (equipment?.entity.name ?? PANEL_LABELS[selectedPanel]);

  return (
    <div className="arsenal-planner">
      <aside className="arsenal-category-rail" aria-label="Loadout categories">
        {BUILD_PANEL_KEYS.map((panel) => {
          const panelSlot = panelEquipmentSlot(panel);
          const item = panelSlot
            ? build.equipment.find((entry) => entry.slot === panelSlot)
            : undefined;
          const summary =
            panel === "operator"
              ? [build.focusSchool?.name, item?.entity.name]
                  .filter(Boolean)
                  .join(" · ")
              : item?.entity.name;
          return (
            <Link
              className={`arsenal-category-card${panel === selectedPanel ? " selected" : ""}`}
              href={`${basePath}?slot=${panel}`}
              key={panel}
              aria-current={panel === selectedPanel ? "page" : undefined}
            >
              <strong>{PANEL_LABELS[panel]}</strong>
              <span>{summary || "Empty"}</span>
            </Link>
          );
        })}
      </aside>

      <section
        className="arsenal-item-panel"
        aria-labelledby="focused-item-name"
      >
        <header className="arsenal-item-heading">
          <div>
            <span className="tag">{PANEL_LABELS[selectedPanel]}</span>
            <h2 id="focused-item-name">{heading}</h2>
          </div>
          {equipment && (
            <Link
              className="nav-button"
              href={`/catalog/${equipment.entity.kind}/${equipment.entity.slug}`}
            >
              Catalog entry
            </Link>
          )}
        </header>

        {editable && slot && (
          <EquipmentPicker
            buildId={buildId!}
            slot={slot}
            panel={selectedPanel}
            equipment={equipment}
            basePath={basePath}
            query={search.equipmentQuery}
            candidates={search.equipmentCandidates ?? []}
          />
        )}

        <div className="arsenal-detail-grid">
          <ItemStats
            build={build}
            panel={selectedPanel}
            equipment={equipment}
            buildId={buildId}
            basePath={basePath}
            search={search}
          />
          <ItemConfiguration
            equipment={equipment}
            panel={selectedPanel}
            buildId={buildId}
            basePath={basePath}
            search={search}
          />
          <ItemArcanes
            build={build}
            panel={selectedPanel}
            buildId={buildId}
            basePath={basePath}
            search={search}
          />
        </div>
      </section>
    </div>
  );
}

function EquipmentPicker({
  buildId,
  slot,
  panel,
  equipment,
  basePath,
  query,
  candidates,
}: {
  buildId: string;
  slot: BuildSlot;
  panel: BuildPanelKey;
  equipment?: BuildEquipmentEntry;
  basePath: string;
  query?: string;
  candidates: BuildCandidate[];
}) {
  return (
    <details className="arsenal-picker" open={!equipment || Boolean(query)}>
      <summary>{equipment ? "Replace item" : "Choose item"}</summary>
      <DebouncedSearchInput
        label="Search equipment"
        parameter="q"
        value={query}
        placeholder={`Find ${PANEL_LABELS[panel].toLocaleLowerCase("en")}…`}
      />
      {candidates.length > 0 && (
        <div className="candidate-list compact-candidates">
          {candidates.map((candidate) => (
            <form
              action={assignEquipment.bind(
                null,
                buildId,
                slot,
                candidate.kind,
                candidate.slug,
              )}
              key={`${candidate.kind}:${candidate.slug}`}
            >
              <span>{candidate.name}</span>
              <button className="nav-button">Equip</button>
            </form>
          ))}
        </div>
      )}
      {query && !candidates.length && (
        <p className="muted">No matching equipment.</p>
      )}
      <a className="muted" href={`${basePath}?slot=${panel}`}>
        Close picker
      </a>
    </details>
  );
}

function ItemStats({
  build,
  panel,
  equipment,
  buildId,
  basePath,
  search,
}: {
  build: PlayerBuild | SharedBuildSnapshot;
  panel: BuildPanelKey;
  equipment?: BuildEquipmentEntry;
  buildId?: string;
  basePath: string;
  search: ArsenalSearchState;
}) {
  return (
    <section className="arsenal-detail-column arsenal-stats">
      <h3>Item stats</h3>
      {panel === "operator" && (
        <FocusSchool
          build={build}
          buildId={buildId}
          basePath={basePath}
          search={search}
        />
      )}
      {equipment ? (
        <>
          <h4>{equipment.entity.name}</h4>
          {equipment.stats?.length ? (
            <dl className="stat-list">
              {equipment.stats.map((stat) => (
                <div key={stat.key}>
                  <dt>
                    {stat.citationUrl ? (
                      <a href={stat.citationUrl} title={stat.sourceName}>
                        {stat.label}
                      </a>
                    ) : (
                      stat.label
                    )}
                  </dt>
                  <dd>{stat.baseValue}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="notice">Structured base stats are not available.</p>
          )}
          {panel === "warframe" && (
            <>
              <Abilities
                build={build}
                equipment={equipment}
                buildId={buildId}
                basePath={basePath}
                search={search}
              />
              <ShardSlots
                build={build}
                buildId={buildId}
                basePath={basePath}
                search={search}
              />
            </>
          )}
        </>
      ) : panel !== "operator" ? (
        <p className="notice">Choose an item to see its sourced stats.</p>
      ) : null}
    </section>
  );
}

function FocusSchool({
  build,
  buildId,
  basePath,
  search,
}: {
  build: PlayerBuild | SharedBuildSnapshot;
  buildId?: string;
  basePath: string;
  search: ArsenalSearchState;
}) {
  return (
    <div className="arsenal-subsection">
      <h4>Focus school</h4>
      {build.focusSchool ? (
        <>
          <strong>{build.focusSchool.name}</strong>
          {build.focusSchool.description && (
            <p>{build.focusSchool.description}</p>
          )}
          {buildId && (
            <form action={clearFocusSchool.bind(null, buildId)}>
              <button className="nav-button danger-text">Clear school</button>
            </form>
          )}
        </>
      ) : (
        <p className="muted">No school selected.</p>
      )}
      {buildId && (
        <>
          <DebouncedSearchInput
            label="Find school"
            parameter="focusq"
            value={search.focusQuery}
          />
          {search.focusCandidates?.map((candidate) => (
            <form
              action={assignFocusSchool.bind(
                null,
                buildId,
                candidate.kind,
                candidate.slug,
              )}
              key={candidate.slug}
            >
              <button className="arsenal-choice-button">
                {candidate.name}
              </button>
            </form>
          ))}
        </>
      )}
      <p className="muted">
        School Ways are assumed maxed; use build notes for a defining unlock.
      </p>
    </div>
  );
}

function Abilities({
  build,
  equipment,
  buildId,
  basePath,
  search,
}: {
  build: PlayerBuild | SharedBuildSnapshot;
  equipment: BuildEquipmentEntry;
  buildId?: string;
  basePath: string;
  search: ArsenalSearchState;
}) {
  return (
    <div className="arsenal-subsection">
      <h4>Abilities</h4>
      {equipment.abilities?.length ? (
        <ol className="ability-list">
          {equipment.abilities.map((ability) => {
            const replacement =
              build.abilityReplacement?.original.slug === ability.slug
                ? build.abilityReplacement.replacement
                : undefined;
            return (
              <li key={ability.slug} className={replacement ? "replaced" : ""}>
                <strong>
                  {ability.slot}. {ability.name}
                </strong>
                {replacement && <span> → {replacement.name} (Helminth)</span>}
                {ability.description && <p>{ability.description}</p>}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="notice">Ordered ability data is unavailable.</p>
      )}
      {build.abilityReplacement && buildId && (
        <form action={clearAbilityReplacement.bind(null, buildId)}>
          <button className="nav-button danger-text">
            Remove Helminth replacement
          </button>
        </form>
      )}
      {buildId && Boolean(equipment.abilities?.length) && (
        <details
          className="arsenal-picker"
          open={Boolean(search.helminthQuery)}
        >
          <summary>Choose Helminth replacement</summary>
          <div className="picker-tabs" aria-label="Ability to replace">
            {equipment.abilities?.map((ability) => (
              <Link
                className={
                  search.helminthOriginal?.slug === ability.slug
                    ? "tag active"
                    : "tag"
                }
                href={`${basePath}?slot=warframe&original=${ability.slug}${search.helminthQuery ? `&helminthq=${encodeURIComponent(search.helminthQuery)}` : ""}`}
                key={ability.slug}
              >
                {ability.name}
              </Link>
            ))}
          </div>
          <DebouncedSearchInput
            label="Search eligible abilities"
            parameter="helminthq"
            value={search.helminthQuery}
          />
          {search.helminthOriginal &&
            search.helminthCandidates?.map((candidate) => (
              <form
                action={assignAbilityReplacement.bind(
                  null,
                  buildId,
                  search.helminthOriginal!.kind,
                  search.helminthOriginal!.slug,
                  candidate.kind,
                  candidate.slug,
                )}
                key={candidate.slug}
              >
                <button className="arsenal-choice-button">
                  Replace with {candidate.name}
                </button>
              </form>
            ))}
          <a className="muted" href={`${basePath}?slot=warframe`}>
            Close picker
          </a>
        </details>
      )}
    </div>
  );
}

function ShardSlots({
  build,
  buildId,
  basePath,
  search,
}: {
  build: PlayerBuild | SharedBuildSnapshot;
  buildId?: string;
  basePath: string;
  search: ArsenalSearchState;
}) {
  const slots = Array.from(
    { length: 5 },
    (_, index) => `archon-shard-${index + 1}` as BuildEnhancementSlot,
  );
  return (
    <div className="arsenal-subsection">
      <h4>Archon Shards</h4>
      <div className="shard-row">
        {slots.map((slot) => (
          <EnhancementCell
            key={slot}
            slot={slot}
            build={build}
            buildId={buildId}
            basePath={basePath}
            panel="warframe"
            search={search}
          />
        ))}
      </div>
    </div>
  );
}

function ItemConfiguration({
  equipment,
  panel,
  buildId,
  basePath,
  search,
}: {
  equipment?: BuildEquipmentEntry;
  panel: BuildPanelKey;
  buildId?: string;
  basePath: string;
  search: ArsenalSearchState;
}) {
  if (!equipment)
    return (
      <section className="arsenal-detail-column arsenal-configuration">
        <h3>Item configuration</h3>
        <p className="notice">No item equipped.</p>
      </section>
    );
  const profile = buildSlotProfile(equipment.slot);
  const auraCount = Math.max(
    profile.auraSlots,
    equipment.factoryPolaritySets?.some((set) =>
      set.polarities.some(
        ({ role, quantity }) => role === "aura" && quantity > 1,
      ),
    )
      ? 2
      : 0,
    equipment.modSlots.some(({ position }) => position === 11) ? 2 : 0,
  );
  const normalPositions = Array.from(
    { length: profile.normalSlots },
    (_, index) => index,
  );
  const top = normalPositions.filter((position) => position % 2 === 0);
  const bottom = normalPositions.filter((position) => position % 2 === 1);
  return (
    <section className="arsenal-detail-column arsenal-configuration">
      <h3>Item configuration</h3>
      {profile.normalSlots ? (
        <>
          <div className="special-slot-row">
            {equipment.passive ? (
              <div className="passive-slot">
                <span>Passive</span>
                <strong>{equipment.passive.baseValue}</strong>
              </div>
            ) : (
              <div />
            )}
            <div className="special-slot-group">
              {Array.from({ length: auraCount }, (_, index) => (
                <ModCell
                  key={`aura-${index}`}
                  equipment={equipment}
                  position={10 + index}
                  buildId={buildId}
                  basePath={basePath}
                  panel={panel}
                  search={search}
                />
              ))}
              {profile.stanceSlots > 0 && (
                <ModCell
                  equipment={equipment}
                  position={10}
                  buildId={buildId}
                  basePath={basePath}
                  panel={panel}
                  search={search}
                />
              )}
            </div>
            {profile.exilusSlots > 0 ? (
              <ModCell
                equipment={equipment}
                position={12}
                buildId={buildId}
                basePath={basePath}
                panel={panel}
                search={search}
              />
            ) : (
              <div />
            )}
          </div>
          <div
            className={`mod-slot-grid columns-${profile.normalSlots === 10 ? 5 : 4}`}
          >
            {[...top, ...bottom].map((position) => (
              <ModCell
                key={position}
                equipment={equipment}
                position={position}
                buildId={buildId}
                basePath={basePath}
                panel={panel}
                search={search}
              />
            ))}
          </div>
        </>
      ) : (
        <p className="notice">
          Amps do not use the standard mod-capacity grid.
        </p>
      )}
      <BuildCapacitySummary capacity={equipment.capacity} />
      {buildId && profile.capacityUpgrade && (
        <AutoSaveForm
          className="form-stack compact-form"
          action={saveEquipmentConfiguration.bind(
            null,
            buildId,
            equipment.slot,
          )}
        >
          <label>
            Configuration
            <input
              name="configuration"
              maxLength={120}
              defaultValue={equipment.configuration}
            />
          </label>
          <div className="inline-form">
            <label>
              Forma
              <input
                name="formaCount"
                type="number"
                min="0"
                max="100"
                required
                defaultValue={equipment.formaCount}
              />
            </label>
            <label className="check-label">
              <input
                name="capacityUpgrade"
                type="checkbox"
                value="yes"
                defaultChecked={equipment.capacityUpgrade}
              />
              Orokin{" "}
              {profile.capacityUpgrade === "reactor" ? "Reactor" : "Catalyst"}
            </label>
          </div>
        </AutoSaveForm>
      )}
      <FactoryPolaritySummary values={equipment.factoryPolaritySets} />
      {equipment.modularPartRoles.length > 0 && (
        <ModularParts
          equipment={equipment}
          panel={panel}
          buildId={buildId}
          basePath={basePath}
          search={search}
        />
      )}
      {buildId ? (
        <AutoSaveForm
          className="form-stack compact-form"
          action={saveEquipmentNotes.bind(
            null,
            buildId,
            equipment.slot,
            equipment.entity.kind,
            equipment.entity.slug,
          )}
        >
          <label>
            Item notes
            <textarea
              name="notes"
              rows={3}
              maxLength={2000}
              defaultValue={equipment.notes}
            />
          </label>
        </AutoSaveForm>
      ) : equipment.notes ? (
        <p className="build-notes">{equipment.notes}</p>
      ) : null}
      {buildId && (
        <form action={clearEquipment.bind(null, buildId, equipment.slot)}>
          <button className="nav-button danger-text">Clear item</button>
        </form>
      )}
    </section>
  );
}

function ModularParts({
  equipment,
  panel,
  buildId,
  basePath,
  search,
}: {
  equipment: BuildEquipmentEntry;
  panel: BuildPanelKey;
  buildId?: string;
  basePath: string;
  search: ArsenalSearchState;
}) {
  return (
    <div className="arsenal-subsection">
      <h4>Modular parts</h4>
      {equipment.modularPartRoles.map((role) => {
        const part = equipment.modularParts.find(
          (entry) => entry.role === role,
        );
        return (
          <div className="modular-part-row" key={role}>
            <span>{formatSlot(role)}</span>
            {part ? (
              <Link href={`/catalog/${part.entity.kind}/${part.entity.slug}`}>
                {part.entity.name}
              </Link>
            ) : (
              <span className="muted">Not selected</span>
            )}
            {buildId && (
              <>
                <Link href={`${basePath}?slot=${panel}&modularrole=${role}`}>
                  Choose
                </Link>
                {part && (
                  <form
                    action={clearModularPart.bind(
                      null,
                      buildId,
                      equipment.slot,
                      role,
                    )}
                  >
                    <button className="nav-button danger-text">Remove</button>
                  </form>
                )}
              </>
            )}
          </div>
        );
      })}
      {buildId && search.modularRole && (
        <div className="mod-context-picker">
          <DebouncedSearchInput
            label={`Find ${formatSlot(search.modularRole)}`}
            parameter="modularq"
            value={search.modularQuery}
          />
          {search.modularCandidates?.map((candidate) => (
            <form
              action={assignModularPart.bind(
                null,
                buildId,
                equipment.slot,
                search.modularRole!,
                candidate.kind,
                candidate.slug,
              )}
              key={candidate.slug}
            >
              <button className="arsenal-choice-button">
                {candidate.name}
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}

function ModCell({
  equipment,
  position,
  buildId,
  basePath,
  panel,
  search,
}: {
  equipment: BuildEquipmentEntry;
  position: number;
  buildId?: string;
  basePath: string;
  panel: BuildPanelKey;
  search: ArsenalSearchState;
}) {
  const role = buildModSlotRoleAt(equipment.slot, position)!;
  const slot = equipment.modSlots.find((entry) => entry.position === position);
  const mod = equipment.mods.find((entry) => entry.position === position);
  const selected = search.modPosition === position;
  const label = role === "normal" ? `Mod ${position + 1}` : role;
  return (
    <div className={`mod-slot-card${selected ? " selected" : ""}`}>
      <div className="mod-slot-meta">
        <span>{label}</span>
        <span>{slot?.polarity ?? "—"} slot</span>
      </div>
      {mod ? (
        <>
          <Link href={`/catalog/${mod.entity.kind}/${mod.entity.slug}`}>
            <strong>{mod.entity.name}</strong>
          </Link>
          <span>{mod.polarity ?? "—"} mod</span>
          <span>
            Rank {mod.rank ?? "?"}
            {mod.maxRank === undefined ? "" : `/${mod.maxRank}`}
          </span>
          <span>{formatDrain(mod.adjustedDrain ?? mod.drain)}</span>
        </>
      ) : (
        <span className="muted">Empty</span>
      )}
      {buildId && (
        <>
          <Link
            className="mod-slot-edit"
            href={`${basePath}?slot=${panel}&position=${position}#mod-picker`}
          >
            {mod ? "Change" : "Add mod"}
          </Link>
          <AutoSaveForm
            className="slot-polarity-form"
            action={saveModSlot.bind(null, buildId, equipment.slot)}
          >
            <input type="hidden" name="position" value={position} />
            <input type="hidden" name="role" value={role} />
            <select
              name="polarity"
              defaultValue={slot?.polarity ?? ""}
              aria-label={`${label} polarity`}
            >
              <option value="">No polarity</option>
              {BUILD_MOD_SLOT_POLARITIES.map((polarity) => (
                <option key={polarity}>{polarity}</option>
              ))}
            </select>
          </AutoSaveForm>
          {mod && (
            <AutoSaveForm
              className="mod-rank-form"
              action={assignMod.bind(
                null,
                buildId,
                equipment.slot,
                position,
                mod.entity.kind,
                mod.entity.slug,
              )}
            >
              <label>
                Rank
                <input
                  name="rank"
                  type="number"
                  min="0"
                  max={mod.maxRank ?? 100}
                  defaultValue={mod.rank ?? mod.maxRank}
                />
              </label>
            </AutoSaveForm>
          )}
          {mod && (
            <form
              action={clearMod.bind(null, buildId, equipment.slot, position)}
            >
              <button className="nav-button danger-text">Remove</button>
            </form>
          )}
        </>
      )}
      {buildId && selected && (
        <div className="mod-context-picker" id="mod-picker">
          <DebouncedSearchInput
            label="Find mod"
            parameter="modq"
            value={search.modQuery}
          />
          {search.modCandidates?.map((candidate) => (
            <form
              action={assignMod.bind(
                null,
                buildId,
                equipment.slot,
                position,
                candidate.kind,
                candidate.slug,
              )}
              key={candidate.slug}
            >
              <input
                type="hidden"
                name="rank"
                value={candidate.modMaxRank ?? ""}
              />
              <button className="arsenal-choice-button">
                {candidate.name}
                {candidate.modMaxRank === undefined
                  ? ""
                  : ` · rank ${candidate.modMaxRank}`}
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemArcanes({
  build,
  panel,
  buildId,
  basePath,
  search,
}: {
  build: PlayerBuild | SharedBuildSnapshot;
  panel: BuildPanelKey;
  buildId?: string;
  basePath: string;
  search: ArsenalSearchState;
}) {
  const slots = enhancementSlotsForPanel(panel);
  return (
    <section className="arsenal-detail-column arsenal-arcanes">
      <h3>Item arcanes</h3>
      {slots.length ? (
        slots.map((slot) => (
          <EnhancementCell
            key={slot}
            slot={slot}
            build={build}
            buildId={buildId}
            basePath={basePath}
            panel={panel}
            search={search}
          />
        ))
      ) : (
        <p className="notice">No arcane slots for this item.</p>
      )}
    </section>
  );
}

function EnhancementCell({
  slot,
  build,
  buildId,
  basePath,
  panel,
  search,
}: {
  slot: BuildEnhancementSlot;
  build: PlayerBuild | SharedBuildSnapshot;
  buildId?: string;
  basePath: string;
  panel: BuildPanelKey;
  search: ArsenalSearchState;
}) {
  const enhancement = build.enhancements.find((entry) => entry.slot === slot);
  const selected = search.enhancementSlot === slot;
  return (
    <div className={`enhancement-slot-card${selected ? " selected" : ""}`}>
      <span className="tag">{formatSlot(slot)}</span>
      {enhancement ? (
        <>
          <Link
            href={`/catalog/${enhancement.entity.kind}/${enhancement.entity.slug}`}
          >
            <strong>{enhancement.entity.name}</strong>
          </Link>
          {enhancement.rank !== undefined && (
            <span>Rank {enhancement.rank}</span>
          )}
          {enhancement.option && <span>{enhancement.option.label}</span>}
        </>
      ) : (
        <span className="muted">Empty</span>
      )}
      {buildId && (
        <>
          <Link
            className="mod-slot-edit"
            href={`${basePath}?slot=${panel}&enhancementslot=${slot}#enhancement-picker`}
          >
            {enhancement ? "Change" : "Assign"}
          </Link>
          {enhancement && (
            <form action={clearEnhancement.bind(null, buildId, slot)}>
              <button className="nav-button danger-text">Remove</button>
            </form>
          )}
          {selected && (
            <div className="mod-context-picker" id="enhancement-picker">
              <DebouncedSearchInput
                label={`Find ${formatSlot(slot)}`}
                parameter="enhancementq"
                value={search.enhancementQuery}
              />
              {search.enhancementCandidates?.map((candidate) => (
                <form
                  action={assignEnhancement.bind(
                    null,
                    buildId,
                    slot,
                    candidate.kind,
                    candidate.slug,
                  )}
                  key={candidate.slug}
                  className="form-stack compact-form"
                >
                  {candidate.kind === "arcane" && (
                    <input
                      name="rank"
                      type="number"
                      min="0"
                      max="100"
                      placeholder="Rank"
                    />
                  )}
                  {candidate.kind === "shard" &&
                    candidate.enhancementOptions?.length && (
                      <select name="optionKey" required>
                        {candidate.enhancementOptions.map((option) => (
                          <option value={option.key} key={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    )}
                  <button
                    className="arsenal-choice-button"
                    disabled={
                      candidate.kind === "shard" &&
                      !candidate.enhancementOptions?.length
                    }
                  >
                    {candidate.name}
                  </button>
                </form>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function panelEquipmentSlot(panel: BuildPanelKey): BuildSlot {
  return panel === "operator" ? "operator-amp" : panel;
}

function enhancementSlotsForPanel(
  panel: BuildPanelKey,
): BuildEnhancementSlot[] {
  if (panel === "warframe") return ["warframe-arcane-1", "warframe-arcane-2"];
  if (panel === "primary") return ["primary-arcane"];
  if (panel === "secondary") return ["secondary-arcane"];
  if (panel === "melee") return ["melee-arcane"];
  if (panel === "operator")
    return [
      "operator-arcane-1",
      "operator-arcane-2",
      "amp-arcane-1",
      "amp-arcane-2",
    ];
  return [];
}

function formatSlot(slot: string): string {
  return slot.replaceAll("-", " ");
}

function formatDrain(value: number | undefined): string {
  if (value === undefined) return "Drain unknown";
  return value < 0 ? `+${Math.abs(value)} capacity` : `${value} drain`;
}
