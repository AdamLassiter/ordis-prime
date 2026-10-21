export interface DiscoveryViewState {
  q?: string;
  kind?: string;
  progress?: string;
}

export function discoveryHref(
  state: DiscoveryViewState,
  focus?: string,
): string {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.kind) params.set("kind", state.kind);
  if (state.progress) params.set("progress", state.progress);
  if (focus) params.set("focus", focus);
  const query = params.toString();
  return query ? `/discovery?${query}` : "/discovery";
}
