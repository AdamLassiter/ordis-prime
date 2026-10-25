# 0117: Published builds are publicly discoverable

## Status

Accepted. Supersedes ADR 0007's unlisted-only discovery boundary while retaining
immutable snapshot semantics.

## Context

Publishing already created a read-only snapshot and redirected to its capability
URL, but the destination did not explicitly confirm success. Each draft exposed
only its own share history, so players could not browse or search published
builds as a collection.

## Decision

Published build snapshots are listed in the public Builds workspace. The
directory supports bounded pagination and case-insensitive search across title,
category, and notes. Draft creation, editing, share revocation, and private
player data remain authenticated and owner-scoped.

Publishing redirects to the new snapshot with an explicit confirmation. The
snapshot remains immutable and keeps its random key; subsequent draft changes
still require another publication. Revocation removes the version from both its
direct URL and the directory.

## Consequences

- Builds becomes a public navigation destination, while private draft controls
  appear only for signed-in players.
- Existing published snapshots appear in the directory because no separate
  legacy visibility flag is retained before the first stable release.
- Search intentionally covers author-written metadata, not installed equipment
  or computed build performance.
- Author identity is not displayed or copied into the published snapshot.
