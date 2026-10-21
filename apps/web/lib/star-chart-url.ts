export interface StarChartViewState {
  q?: string;
  needed?: boolean;
  access?: string;
  completion?: string;
}

export function starChartHref(
  state: StarChartViewState,
  focus?: string,
): string {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.needed) params.set("needed", "1");
  if (state.access) params.set("access", state.access);
  if (state.completion) params.set("completion", state.completion);
  if (focus) params.set("focus", focus);
  const query = params.toString();
  return query ? `/star-chart?${query}` : "/star-chart";
}
