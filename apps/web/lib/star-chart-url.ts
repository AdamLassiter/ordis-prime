export interface StarChartViewState {
  planet?: string;
  show?: string[];
}

export function starChartHref(state: StarChartViewState): string {
  const params = new URLSearchParams();
  if (state.planet) params.set("planet", state.planet);
  for (const detail of state.show ?? []) params.append("show", detail);
  const query = params.toString();
  return query ? `/star-chart?${query}` : "/star-chart";
}
