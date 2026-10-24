# Known gaps and compromises

This is a living record of where the implementation differs from the intended
architecture. A feature appearing in the roadmap is not evidence that it exists.

## Current

- The workspace installs from a frozen lockfile and has been verified with its
  type checks, tests, production build, SQLite migration, and production
  container smoke test. GitHub Actions runs those build gates, but the workflow
  has not yet been observed on the remote repository.
- The canonical schema, initial migration, and transactional per-source
  promotion exist. Each release now records its complete active source-run
  composition. Snapshot-evidence coherence, whole-candidate identity,
  singleton-fact and ranking invariants run before a source is staged. The
  composed candidate also rejects active
  facts that would reference a retired entity, use non-node entities in
  node-only positions, attach enhancement options to non-shards, or introduce
  a cycle through active recipe alternatives. Broader cross-source semantic
  completeness checks remain unimplemented. Automatic WFCD and structured Wiki
  catalog adapters reject candidates below half their preceding observation
  count, but this coarse guard
  does not detect selective omissions or semantically implausible changes above
  that floor. The worker retains a configurable number of inactive
  catalog releases and removes unreferenced clean source runs and their facts;
  runs containing resolver conflicts remain protected for review. Refresh-operation
  rows are bounded per source. Raw content-addressed payloads without any retained
  database reference are collected after a configurable safety grace. A
  SQLite-leased job runner handles recurring work. The default development
  command starts that worker beside the web app; an administrator warning
  detects overdue unclaimed work when no active lease is visible. This is an
  inferred local-health signal rather than a persisted worker heartbeat.
  Migrations run lazily when the web process first opens SQLite. Canonical entity fields are recomputed
  from value-bearing provenance whenever active source membership changes, so
  priority fallback, exact-tie selection and withdrawal are deterministic across
  import order. Name and slug are still
  retained as identity labels when no active source asserts them; arbitrary
  typed field schemas and per-field merge policies are not yet modeled. Older
  provenance rows have no reconstructable asserted value and retain their
  canonical field until their source is refreshed.
- WFCD item and mission-drop adapters exist and emit entities, recipes,
  components, arcanes, Archon Shards, nodes, and drops. Fetched payloads can be retained in an
  immutable, hash-verified snapshot store and observations can be resolved into
  canonical SQLite records with provenance and reviewable conflicts through a
  provider-neutral refresh command. Validated, cited manual ranking and factual
  overlay YAML use this same path. Refresh attempts and failures are persisted
  without replacing active data. Administrators can inspect recent attempts,
  bounded failure messages, retained snapshot paths, and record-level resolver
  conflicts. Administrators can review or reopen conflicts with an append-only
  audit trail. Ordinary review state does not mutate catalog identity. For
  ambiguous entity identities, administrators can instead bind an exact
  conflicting external ID to an offered canonical candidate. These overrides
  are reversible and audited; their revision causes unchanged source bytes to
  promote as a new run so skipped observations can replay. Automatic sources
  are queued immediately, while manual sources require re-upload.
  Reused WFCD equipment components with generic labels derive a stable qualified
  name from their internal identifier rather than collapsing unrelated parts.
  A stable external ID whose winning kind/slug would collide with a different
  canonical entity rejects the whole candidate with record-level context; it is
  not silently merged. One bounded exception repairs legacy `wfcd-items`
  parser drift for an exact provider identifier, including splitting
  incompatible IDs that old same-name matching joined. Exact provider IDs may
  also refine and merge an untyped placeholder into one unambiguous typed
  canonical match. Unknown current kinds, ambiguous repair targets, and
  ordinary cross-source disagreements still remain reviewable conflicts.
  Structured WARFRAME Wiki adapters also import cited weapon, Warframe and
  Archwing maximum ranks plus mission metadata and star-chart connections from
  versioned Lua data modules without executing provider code. A separate Wiki
  adapter imports current abilities and typed Warframe/Archwing ownership links.
  Structured main and optional quest records contribute cited descriptions and
  sequence links, while intentionally not treating sequence as an access rule.
  The structured mission source also contributes its current explicit boss
  identities and cited mission links. Boss classification refines a matching
  broad WFCD enemy in place and is not later downgraded by that broader source.
  The mission adapter separately imports node requirements only when the entire
  structured prose expression matches an allow-listed combination of completed
  quests and nodes; the current Vehrvod District quest-plus-node condition is
  fully represented. Other mixed conditions remain absent rather than becoming
  unsafe partial rules. Exact Mastery Rank-only expressions populate the
  existing numeric gate. Supported Railjack Intrinsics-only and
  quest-and-Intrinsics expressions populate a separate cited gate. Exact Kuva
  Lich, Sister of Parvos and Technocyte Coda confrontation expressions retain
  every supported rank or quest clause plus a typed active-adversary gate.
  The complete Elite Sanctuary Onslaught expression retains The New Strange
  plus its typed level-30 Warframe gate.
  Exact item-only Animo Nav Beacon, Judgement Point, Grendel Locator and
  Mutalist Alad V Assassinate Key expressions populate cited quantity gates
  that compose with private inventory. Other items and mixed item conditions
  still fail closed as a whole.
  The Wiki companion
  module does not expose a maximum-rank field, so companion coverage remains
  absent rather than defaulted. Wiki weapon, Warframe and Archwing records expose
  complete factory-polarity sets by role and count, while WFCD supplies normal
  factory polarities for the companion records that disclose them. Missing
  companion polarity fields remain unknown. These sets retain empty and
  configuration-specific assertions, but not invented grid positions. The
  adapters do not cover arbitrary article content. The leased worker schedules WFCD item, drop, Wiki
  weapon, Wiki Warframe, Wiki mission and Wiki ability refreshes daily, and an
  administrator can bring supported source jobs forward from the source UI. A provider-neutral world-state
  pipeline snapshots and transactionally promotes WFCD cycles, events, alerts,
  fissures and traders. A provider response older than the active observation
  time is rejected rather than rewinding live state.
  A public timer view exposes active and upcoming windows with client-updating
  countdowns and visible snapshot freshness. A database-leased production worker
  polls it every five minutes and retries failures without replacing active data.
  Snapshots older than a configurable threshold are visibly marked stale without
  hiding their data. Normalized world-state history and unreferenced raw payload
  storage are bounded independently. Exact unique node names and catalog aliases
  are reconciled to canonical nodes; ambiguous or differently spelled labels
  remain plain source text. Finished
  job history is count-bounded and filterable by kind, status and source.
  Source operation pages report persisted record counts, durations and aggregate
  throughput. Attempts stranded by a terminated process are failed after the
  worker's maximum lease, so they do not remain permanent retention roots;
  provider spellings absent from catalog aliases remain unresolved.
- The web explorer reads the canonical SQLite catalog and links active recipes,
  drops, nodes, record-level provenance, and editorial rankings. Newly imported
  entity fields and typed relations retain exact source record keys, paths, and
  citations when supplied. Older pre-provenance relation rows display without
  those optional details. Docker deployments queue initial catalog imports in
  the worker and expose administrator-only refresh controls. Administrators can
  upload bounded ranking, discovery or factual-overlay YAML through the same
  snapshot/promotion pipeline. A dry run executes and rolls back the same
  resolver/promotion transaction before the separately confirmed import.
  Manual uploads still run synchronously in the web request.
  Catalog search and node reward/discovery lists expose canonical-kind filters.
  The current live catalog has no active `unknown` entities after the expanded
  WFCD taxonomy and typed drop/mod indexes are applied. New or changed provider
  categories can still fail closed or reintroduce unknowns until their semantics
  are reviewed. Entity detail pages render generic cited key/value attributes;
  the Wiki Warframe source currently supplies description, health, shield,
  armor, energy, sprint speed and passive text. Arbitrary weapon damage modes
  and fully structured ability mechanics remain future source-specific work.
- The shared navigation and application pages use a consistent scope, title and
  lede hierarchy, visible current-page states, responsive layouts and
  reduced-motion support. Evidence and administration language deliberately
  remains more technical than player-facing guidance. The design remains
  CSS-native without bespoke illustration or a richer motion system.
- Local email/password accounts, persisted sessions, closed registration, and
  first-administrator bootstrap enforcement are wired at the authentication
  API, with first-run, sign-in, and sign-out UI. Player-state reads and mutations
  are scoped by the authenticated user in database queries. Administrators can
  list local accounts and safely change roles with session invalidation.
  Players can transactionally delete their own account and revoke its public
  build shares, with final-administrator protection and retained audit labels.
  Deletion requires the current local password and an exact confirmation
  phrase. Password recovery is not implemented yet.
- Validated inventory persistence, authenticated catalog editing, an inventory
  summary, node reward ownership filtering, and portable profile import/export
  with transfer UI exist. Players can also upload a bounded raw Warframe
  inventory response: allow-listed `ItemType` paths resolve exactly through
  WFCD identifiers, raw bytes and account fields are not retained, and counts
  plus Helminth subsumes merge monotonically. The app does not acquire session
  credentials, poll a player account, lower stale counts, infer mastery, or
  retain a synchronization audit. Authenticated goals feed a planner that
  subtracts inventory, expands active recipes, lists missing requirements, and
  links to candidate nodes with visible reasons. Profiles include inventory, goals,
  discovery progress, static todos, watch rules and private build drafts.
  Generated alerts and published share snapshots are deliberately excluded.
  Live windows on reconciled recommended nodes surface as expiring acquisition
  opportunities. Cited Circuit paths separately surface current, next and later
  rotating options for missing linked rewards. Players can inspect and persist alternative recipe choices by
  stable source record identity. Profiles also carry the player's optional
  Mastery Rank, highest Railjack Intrinsic category rank and current
  none-or-kind adversary state as private progression inputs. A separate
  highest currently available Warframe rank supports equipment-rank gates.
  Planning composes cited discovery prerequisites
  into available, conditional, blocked and unknown node access states. Sourced
  numeric Mastery and Railjack Intrinsics gates compose with separate private
  portable player ranks. Exact cited beacon, Judgement Point, Grendel Locator
  and Mutalist Alad V key gates compose with owned plus built inventory. Exact
  adversary confrontation gates compose with the portable private adversary
  setting. Linked catalog pages show cached public Warframe.market top orders.
  The public Index additionally stores bounded daily aggregates for relics,
  their rewards, Standing mods and all tradeable Arcanes. It models explicit
  relic refinement, solo EV, four-player same-relic best-choice EV, direct relic
  prices, ducat EV, trace efficiency, and rank-zero/maximum-rank Arcane prices.
  These are visible-order signals, not completed-sale history; taxes, trade
  limits, reputation gain, daily Standing caps, mission duration and time-to-farm
  are not modeled. The planner does not compare platinum against farm routes or
  manage a player's listings. Other conditional gates remain incomplete.
- Authenticated players can keep private static todos with optional notes and due
  dates. Source-neutral world-state watches match current window fields and
  create deduplicated private in-app alerts. Detail pages can create todos and
  world-state watches linked to one canonical item, discovery topic or node.
  Node and item watches match exact reconciled canonical identity. World-state
  subjects currently cover WFCD alert rewards, event names/rewards, trader
  inventory, and derived Circuit rotation rewards; unexposed or ambiguous subjects remain unmatched. Todos
  support fixed-day, weekly, monthly-date, monthly-weekday and yearly calendar
  recurrence while remaining date-only; there are no web-push or webhook delivery channels. Watches
  can be edited, paused and resumed without losing generated alerts.
  Read, expired alerts have configurable time-based retention; unread and
  non-expiring alert history is deliberately not pruned automatically.
- Private, revisioned build persistence supports partial equipment loadouts in
  a focused Arsenal rail, positioned mods, reduced mod ranks, configuration labels, Forma counts,
  capacity-upgrade flags, notes and immutable unlisted share snapshots.
  Authenticated editor and public snapshot routes use canonical catalog links. Sourced mod
  maximum-rank, base-drain and polarity facts validate selected ranks and expose
  per-mod unpolarized drain. Player-authored mod-slot roles and polarities are
  preserved independently of installed mods and drive a derived adjusted drain
  or capacity bonus at matching positions. Whole-build capacity combines
  max-rank equipment capacity, Orokin upgrades and fully known adjusted mod values. Incomplete inputs
  produce a partial or unknown result rather than an estimate, and Operator
  Amps are excluded from this mod-capacity model. Cited factory-polarity role
  and count sets guide build setup, while exact factory positions and
  comprehensive companion maximum ranks remain unavailable. Builds can assign
  ranked arcanes and positioned Archon Shards with sourced effect selections.
  Arcane candidates and assignments enforce sourced broad and specialized weapon classes against
  equipped items in either assignment order. Equipment slots also enforce
  sourced weapon classes. Kitgun chambers and Zaw strikes act as the current
  modular weapon representatives. WFCD now supplies cited canonical roles for
  chambers, strikes, grips, loaders and links. Build drafts compose each
  representative with one compatible part per remaining role and carry those
  parts through shares, clones, profiles and acquisition goals, but do not yet
  derive combination statistics. Private drafts are
  portable and can be cloned; their snapshot history can be viewed or revoked.
  Authenticated recipients can clone a public snapshot into a private draft.
  Draft equipment and mods can seed missing-item acquisition goals, but the
  planner does not yet use build capacity to optimize alternative mod ranks or
  configuration-specific requirements. Warframes expose sourced base stats,
  passives and ordered abilities, with one validated subsumable Helminth
  replacement, its sourced Helminth-specific description where the Wiki declares
  a change, and five shard slots. The combined Operator panel stores one of
  five Focus schools and the Amp, but does not model individual Way ranks.
  Mod effects are not yet parsed into derived item stats, and deeper Helminth
  incompatibilities beyond explicit eligibility remain advisory gaps.
- Active cited editorial ranking sets have a public source-and-item comparison
  matrix with source-subset controls and coverage counts that preserve unlike
  scales and disagreement. An opt-in derived ordinal summary exposes its exact
  scale-position median and range method beside the raw tiers. It deliberately
  does not model source authority, recency, scope alignment or patch relevance.
  Seven bundled Overframe community sets provide a dated starter comparison for
  Warframes, primary, secondary and melee weapons, Archwing equipment, and
  companions and Helminth abilities. They are manually transcribed snapshots with captured vote counts
  and are never refreshed automatically, so their staleness is visible and
  intentional. Creator transcript conversions add nine independently cited
  sets and a hash-based conversion index, including KnightmareFrame's separate
  average- and high-investment contexts. Rankings can be
  ordered by tier and a single source opens as a tier-grouped isolated list.
- Structured MediaWiki pages now have a durable, timestamped 30-day cache and
  can be reprocessed offline. Weapon records expose public equipment fields and
  per-attack damage, critical, status, firing, range and falloff facts;
  Warframe and Archwing records expose simple public fields beyond their base
  stats. This remains a selected-page cache rather than a whole-Wiki crawl.
  Non-literal Lua expressions are not executed, complex tables require explicit
  normalization, and there is not yet a cache inventory or eviction control in
  the operator UI.
- WFCD item and drop observations compose planet, mission and level metadata in
  a public Star Chart that opens on a planet-summary Origin System and zooms
  into one planet's cited node graph. Multi-select detail controls replace
  result-removing filters. A browser-only tracing tool exports normalized planet
  circles, arc controls, mission nodes and junction positions; the renderer
  consumes a partial checked-in layout and derives deterministic fallback
  geometry for anything missing. No complete traced layout ships yet, so the
  default geometry is not a claim about exact in-game positions. The structured
  Wiki mission adapter supplies the attributed node and connection set;
  connectivity remains navigation evidence rather than proof of player
  completion. Signed-in players can record portable private node completion,
  and a planet-scoped bulk editor updates only its explicit submitted scope.
  Junction pages now supply four ordered, cited public objectives per
  Junction. Players can record portable private completion per current task and
  that state drives the shared access derivation, but there is no automatic
  game-account import or node-variant completion model yet. Their current task
  and completion rewards are modeled as cited one-time grants. Safely resolved
  identities link to catalog entities; Chroma Neuroptics intentionally remains
  label-only because the current WFCD component identities are conflated.
  Linked grants compose with private inventory and the chart's unowned filter,
  but completing a task does not automatically mutate inventory or quest state.
- A public discovery atlas searches canonical quest, ability, enemy, boss,
  mechanic and secret kinds. WFCD currently populates quests and enemies;
  structured Wiki data populates current abilities, descriptions, exact augment
  mod links and typed Warframe/Archwing links, current quests and their
  sequence, plus explicitly declared mission bosses and node links. A separately scheduled structured
  enemy adapter accepts only explicit Wiki `Boss` classifications across all
  declared faction partitions, including Anarchs. Its live import currently
  promotes 62 cited boss observations and preserves distinct source-qualified
  variants when the Wiki repeats a display name. Cited discovery YAML can add
  curated entities and typed links to nodes, rewards, or other topics. Players
  can privately mark topics unseen, discovered, or completed and filter the
  atlas by that state. Boss region/location normalization, quest-step progress,
  broader quest requirements, unsupported
  Necramech/Helminth ability-owner kinds and conditional
  relations remain. Atlas cards preview up to three cited neighbors, and a
  shareable focused graph renders every unique direct neighbor from the active
  cited relations. The graph uses transient deterministic ring positions; a
  global or multi-hop spatial layout remains.
- Vendor discovery is intentionally narrow. Nightcap has a cited Fortuna
  location, Fergolyte-priced offerings and Deepmines context. Other structured
  vendor records are not promoted until an independently cited canonical node
  mapping is reviewed; bounty rotations and random reward chances are not yet
  modeled as vendor facts.
- Warframe.market's public v2 item manifest bridges tradable slugs through game
  references. Catalog pages load the current top online buy and sell offers on
  demand with a one-minute server cache and a direct listings link. Orders are
  volatile display data, not catalog facts, inventory evidence, or planner
  scoring. Authentication, listing management, trade automation, price history,
  platform selection, subtype/rank controls, and offline-order browsing remain
  out of scope while public OAuth client registration is unavailable.
- Acquisition recommendations compose active `requires` and `unlocks` relations
  with private discovery completion and sourced node Mastery Rank or Railjack
  Intrinsics requirements and allow-listed item quantities to show cited
  blockers. Node pages expose the same cited requirements and
  private discovery or node-completion progress. Nodes without access evidence
  stay unknown. Junction objective text and private completion now compose into
  access, while typed rewards remain display facts rather than repeatable drops
  or automatic inventory changes. Linked grants appear as distinct one-time
  options for missing planner requirements, without chance or efficiency
  scoring. Other compound equipment or item conditions still need typed models.

## Deliberate compromises

- Broad Wiki pages remain external detail links. Automated Wiki ingestion is
  limited to selected structured modules and the narrowly validated Junction
  task tables rather than treating arbitrary prose as catalog truth.
- Recommendations explain goal coverage and documented chance but do not claim
  time efficiency without reliable mission-duration data.
- SQLite and one application instance are the deployment target. PostgreSQL and
  multi-instance coordination are not designed until demonstrated necessary.
- English canonical names come first; source identifiers and aliases preserve a
  route to later localization.
