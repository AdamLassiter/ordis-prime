export function relationLabel(
  kind: string,
  direction: "outgoing" | "incoming",
): string {
  if (direction === "outgoing") return kind.replaceAll("-", " ");
  if (kind === "follows") return "followed by";
  if (kind === "connects-to") return "connects to";
  return `is ${kind.replaceAll("-", " ")} by`;
}
