import type { BuildCapacity } from "@ordis-prime/db";

export function BuildCapacitySummary({
  capacity,
}: {
  capacity: BuildCapacity | undefined;
}) {
  if (capacity === undefined) return null;
  if (capacity.total !== undefined) {
    return (
      <p className="muted">
        Capacity: {capacity.drain}/{capacity.total} used · {capacity.remaining}{" "}
        remaining
        {capacity.bonus
          ? ` · ${capacity.base} equipment + ${capacity.bonus} Aura/Stance`
          : ""}
      </p>
    );
  }
  if (capacity.base !== undefined) {
    return (
      <p className="muted">
        Equipment capacity: {capacity.base}. Total unknown until every installed
        mod has enough rank, drain and slot data.
      </p>
    );
  }
  return (
    <p className="muted">
      Capacity unknown. Record current equipment rank and combined Mastery Rank;
      equipment above rank 30 also needs sourced maximum-rank data.
    </p>
  );
}
