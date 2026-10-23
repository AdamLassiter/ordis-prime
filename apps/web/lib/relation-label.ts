export function relationLabel(
  kind: string,
  direction: "outgoing" | "incoming",
): string {
  if (direction === "outgoing")
    return kind === "connects-to" ? "connects to" : kind.replaceAll("-", " ");
  return (
    {
      requires: "required by",
      unlocks: "unlocked by",
      "occurs-at": "occurrence for",
      involves: "involved in",
      rewards: "rewarded by",
      "connects-to": "connects to",
      follows: "followed by",
      augments: "augmented by",
      offers: "offered by",
    }[kind] ?? `is ${kind.replaceAll("-", " ")} by`
  );
}
