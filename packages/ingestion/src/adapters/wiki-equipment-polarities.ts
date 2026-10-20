import {
  MOD_POLARITIES,
  type EquipmentPolarityRole,
  type ModPolarity,
} from "@ordis-prime/domain";
import type { TableConstructorExpression } from "luaparse";
import { luaLiteralField, luaStringValue } from "./mediawiki-lua.ts";

export interface ParsedEquipmentPolarity {
  role: EquipmentPolarityRole;
  polarity: ModPolarity;
  quantity: number;
}

export function parseEquipmentPolarities(
  record: TableConstructorExpression,
  label: string,
  specialFields: ReadonlyArray<{
    field: string;
    role: Exclude<EquipmentPolarityRole, "normal">;
  }>,
): ParsedEquipmentPolarity[] {
  const values: Array<{
    role: EquipmentPolarityRole;
    polarity: ModPolarity;
  }> = [];
  const normal = luaLiteralField(record, "Polarities");
  if (normal !== undefined) {
    if (normal.type !== "TableConstructorExpression")
      throw new Error(`${label} has non-literal Polarities`);
    for (const field of normal.fields) {
      if (field.type !== "TableValue")
        throw new Error(`${label} has non-array Polarities`);
      const polarity = parsePolarity(luaStringValue(field.value), label);
      if (polarity) values.push({ role: "normal", polarity });
    }
  }
  for (const { field, role } of specialFields) {
    const expression = luaLiteralField(record, field);
    if (expression === undefined) continue;
    const polarity = parsePolarity(luaStringValue(expression), label);
    if (polarity) values.push({ role, polarity });
  }

  const counts = new Map<string, ParsedEquipmentPolarity>();
  for (const value of values) {
    const key = `${value.role}:${value.polarity}`;
    const prior = counts.get(key);
    counts.set(key, {
      ...value,
      quantity: (prior?.quantity ?? 0) + 1,
    });
  }
  return [...counts.values()].sort(
    (left, right) =>
      left.role.localeCompare(right.role) ||
      left.polarity.localeCompare(right.polarity),
  );
}

function parsePolarity(
  value: string | undefined,
  label: string,
): ModPolarity | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "None") return undefined;
  if (trimmed === "Universal") return "aura";
  const normalized = trimmed.toLocaleLowerCase("en");
  if (
    !normalized ||
    !(MOD_POLARITIES as readonly string[]).includes(normalized)
  )
    throw new Error(`${label} has invalid polarity ${value ?? "value"}`);
  return normalized as ModPolarity;
}
