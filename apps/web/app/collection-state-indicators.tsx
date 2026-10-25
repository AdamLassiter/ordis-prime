import type { CollectionState } from "@ordis-prime/domain";

interface Props extends CollectionState {
  mastered?: boolean;
  ownedCount?: number;
  builtCount?: number;
  wantedCount?: number;
  compact?: boolean;
}

export function CollectionStateIndicators({
  acquired,
  masteryCapable,
  explicitlyWanted,
  implicitlyWanted,
  requiredByGoal,
  mastered,
  ownedCount,
  builtCount,
  wantedCount,
  compact = false,
}: Props) {
  const labels: Array<{ key: string; label: string; title: string }> = [];
  if (acquired) {
    const quantities = [
      ownedCount ? `${ownedCount} owned` : undefined,
      builtCount ? `${builtCount} built` : undefined,
    ].filter(Boolean);
    labels.push({
      key: "acquired",
      label: compact
        ? "Owned"
        : `Acquired${quantities.length ? ` · ${quantities.join(" · ")}` : ""}`,
      title: "Acquired: at least one owned or built copy is recorded.",
    });
  } else
    labels.push({
      key: "unowned",
      label: "Unowned",
      title: "No owned or built copy is recorded.",
    });
  if (masteryCapable)
    labels.push(
      mastered === true
        ? { key: "mastered", label: "Mastered", title: "Mastery is confirmed." }
        : mastered === false
          ? {
              key: "unmastered",
              label: "Not mastered",
              title: "This item is confirmed not mastered.",
            }
          : {
              key: "mastery-unknown",
              label: "Mastery unknown",
              title: "No mastery state has been recorded.",
            },
    );
  if (explicitlyWanted)
    labels.push({
      key: "explicit-wanted",
      label: wantedCount && !compact ? `Wanted · ${wantedCount}` : "Wanted",
      title: "Explicitly wanted: saved by the player.",
    });
  else if (requiredByGoal)
    labels.push({
      key: "goal-required",
      label: "Required by goal",
      title:
        "Required by an acquisition goal. This does not change the player's wanted count.",
    });
  else if (implicitlyWanted)
    labels.push({
      key: "implicit-wanted",
      label: compact ? "Mastery target" : "Suggested for mastery",
      title:
        "Suggested because mastery has not been confirmed. This does not change the player's wanted count.",
    });
  return (
    <span
      className="collection-states"
      aria-label={labels.map((entry) => entry.label).join(", ")}
    >
      {labels.map((entry) => (
        <span
          className={`tag collection-state state-${entry.key}`}
          key={entry.key}
          title={entry.title}
        >
          {entry.label}
        </span>
      ))}
    </span>
  );
}
