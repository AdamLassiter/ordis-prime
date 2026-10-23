# 0102: Star Chart has region scopes and sized overlays

## Context

The first Star Chart overview treated every location as a planet in the Origin
System. Railjack Proximas and self-contained spaces such as Duviri, Sanctuary
and the Dark Refractory do not fit that hierarchy. The tracing tool also used
free text for canonical labels and positioned markers against a padded
`background-size: contain` box, so a correct click or radius could drift from
the displayed screenshot.

## Decision

Navigation has three explicit top-level presentation scopes: Origin System,
Railjack, and Sanctuary / Duviri. Höllvania remains in the Origin System because
its catalog nodes behave like a planet graph; names ending in `Proxima` belong
to Railjack; Sanctuary, Dark Refractory and Duviri locations share the third
scope. The scope is shareable URL state and does not change canonical node or
planet identities.

The local tracing tool obtains its planet and node choices from the active
catalog, so stored labels cannot be arbitrary input. The imported screenshot is
an actual full-width image inside the annotation surface, with normalized
coordinates and radii measured against that exact surface. Planet, node and
junction radii can be changed both before placement and from the annotation
list.

Planet overlays may also declare manual edges and optional normalized control
points. These are presentation-only routes for spaces whose visual connections
are not supplied by the catalog; they do not become sourced `connects-to`
facts.

## Consequences and gaps

- One renderer can retain canonical node identity while presenting different
  game navigation regions coherently.
- Existing schema-version 1 point annotations remain valid because node and
  junction radii and planet edge lists are optional.
- The scope grouping is an explicit product classification, not an upstream
  claim. New exceptional regions require updating the classifier and its test.
- Layout JSON still requires a human to download, review and check into the
  configured manual-data path.
