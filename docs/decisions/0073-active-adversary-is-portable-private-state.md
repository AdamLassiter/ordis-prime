# 0073: Active adversary is portable private state

Status: accepted

## Context

The final Railjack confrontation for a Kuva Lich, Sister of Parvos or
Technocyte Coda is available only when that matching adversary is active. The
Wiki mission source documents the node rule, but whether a player currently has
an adversary is private and changes independently of catalog refreshes. The
[official Technocyte Coda overview](https://www.warframe.com/en/news/technocyte-coda-deep-dive)
confirms that a player cannot start a Coda while targeted by a Lich or Sister;
the current adversary system therefore permits one active kind at a time.

An absent setting cannot mean “none”: that would turn a player who has not
entered this information into a known blocked state.

## Decision

Store the cited required adversary kind on the node detail fact. Store the
player's current value separately as one of none, Kuva Lich, Sister of Parvos or
Technocyte Coda; keep an absent value as not recorded. Include the private value
in profile export and import.

Import only complete allow-listed Wiki expressions. The Kuva Lich and Sister
forms retain their Railjack Intrinsics requirement, while the Technocyte Coda
form retains its quest prerequisite. Derive access by composing every clause:
a matching adversary is met, an explicitly different or absent-in-game
adversary is blocked, and unrecorded private state is conditional.

## Consequences

- The planner, star chart and node page use one access derivation and explain
  the cited requirement beside the player's private state.
- Changing adversary state immediately changes access without rewriting sourced
  catalog facts.
- Adversary rank, anger, requiem progress and controlled nodes are not implied
  by this coarse current-kind setting.
