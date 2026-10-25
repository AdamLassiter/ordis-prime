# Ordis Prime design documentation

These documents describe both the application Ordis Prime aims to become and
the compromises between that target and the current implementation.

- [Architecture](ARCHITECTURE.md) defines system boundaries and the intended data flow.
- [User stories](USER_STORIES.md) defines player and administrator outcomes.
- [Sources](SOURCES.md) records provider and licence policy.
- [Manual data](MANUAL_DATA.md) defines cited editorial, discovery, factual overlay, and enhancement-option import formats.
- [Profile data](PROFILE_DATA.md) defines portable player-state identity and import behavior.
- [Account synchronization](ACCOUNT_SYNC.md) records the safe automatic-sync boundary and evidence needed to expand it.
- [Marketplace](MARKETPLACE.md) defines the anonymous Warframe.market identity and live-order boundary.
- [Market](MARKET.md) defines relic, syndicate-mod, and Arcane valuation semantics.
- [Acquisition planner](ACQUISITION_PLANNER.md) defines goal and recommendation semantics.
- [World state](WORLD_STATE.md) defines dynamic availability and snapshot semantics.
- [Todos and dynamic watches](TODOS.md) defines private tasks and alert intent.
- [Builds and sharing](BUILDS.md) defines editable drafts and immutable public snapshots.
- [Star chart](STAR_CHART.md) defines composed node metadata and spatial compromises.
- [Progression](PROGRESSION.md) defines discoverability goals and typed relations.
- [Voice and interface](VOICE_AND_INTERFACE.md) defines the visual language and the boundary between diegetic copy and precise evidence.
- [Authentication](AUTHENTICATION.md) defines local account setup and registration policy.
- [Roadmap](ROADMAP.md) orders capabilities around end-to-end value.
- [Known gaps](GAPS.md) is the authoritative implementation delta.
- [Architecture decisions](decisions/) records decisions that should remain
  understandable even after the surrounding code changes.

Update `GAPS.md` whenever a compromise is introduced or removed. Add an ADR
when changing a durable boundary or reversing an accepted decision. Before the
first stable release, prefer replacing a weak design over preserving compatibility.
