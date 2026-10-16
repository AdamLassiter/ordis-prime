# 0049: Store mod capacity facts as canonical sourced fields

Status: accepted

## Context

Build drafts store mod rank, Forma count and capacity-upgrade state, but a rank
alone cannot determine drain. WFCD exposes each mod's maximum rank, base drain
and polarity. Keeping those values inside the provider adapter would force the
build system to depend on WFCD vocabulary and prevent a cited manual source from
correcting bad metadata.

The aggregate feed also contains placeholder Riven records with impossible
values such as maximum rank 592 and extreme integer drain. Importing those as
ordinary facts would make later calculations confidently wrong.

## Decision

Add optional canonical `modMaxRank`, `modBaseDrain` and `modPolarity` entity
fields with value-bearing provenance and the existing priority, retrieval-time
and stable-source tie breaking. Permit these fields only on mod entities.

Accept maximum ranks from zero through ten, base drain from -4 through 10, and
the explicit polarity vocabulary used by maintained WFCD data. The WFCD adapter
omits out-of-range or unknown values while still importing the mod identity.
Manual factual overlays may cite corrections using the same validated fields.

## Consequences

- Catalog pages can explain the sourced inputs needed for future build drain
  calculations.
- Provider placeholders remain visible as mods but do not masquerade as valid
  capacity facts.
- Field withdrawal and source fallback behave like other canonical attributes.
- This does not yet model equipment-slot polarities, aura/stance slot semantics,
  Exilus slots, or calculate build capacity; those require separate rules and
  persisted slot state.
