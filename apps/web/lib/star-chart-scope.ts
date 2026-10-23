export const STAR_CHART_SCOPES = [
  ["origin", "Origin System"],
  ["railjack", "Railjack"],
  ["other", "Sanctuary / Duviri"],
] as const;

export type StarChartScope = (typeof STAR_CHART_SCOPES)[number][0];

export function isStarChartScope(
  value: string | undefined,
): value is StarChartScope {
  return STAR_CHART_SCOPES.some(([scope]) => scope === value);
}

export function starChartScope(planet: string): StarChartScope {
  if (/\bProxima$/i.test(planet)) return "railjack";
  if (/^(Dark Refractory|Duviri|Sanctuary)/i.test(planet)) return "other";
  return "origin";
}
