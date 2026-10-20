import type { CatalogEquipmentPolaritySet } from "@ordis-prime/db";

export function FactoryPolaritySummary({
  values,
}: {
  values?: readonly CatalogEquipmentPolaritySet[];
}) {
  if (!values?.length) return null;
  return (
    <div className="muted">
      {values.map((value, index) => (
        <p
          key={`${value.sourceName}:${value.configuration ?? "default"}:${index}`}
        >
          Factory polarities
          {value.configuration ? ` (${value.configuration})` : ""}:{" "}
          {value.polarities.length
            ? value.polarities
                .map(
                  ({ role, polarity, quantity }) =>
                    `${quantity} × ${polarity} ${role}`,
                )
                .join(" · ")
            : "none"}{" "}
          (
          {value.citationUrl ? (
            <a href={value.citationUrl}>{value.sourceName}</a>
          ) : (
            value.sourceName
          )}
          ). The source records roles and counts, not positions; configure
          positioned slots below for capacity calculations.
        </p>
      ))}
    </div>
  );
}
