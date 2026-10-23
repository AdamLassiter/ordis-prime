// Short in-game Orbiter lines documented at:
// https://wiki.warframe.com/w/Ordis/Quotes
export const ORDIS_VOICE_LINES = [
  "Welcome back, Operator!",
  "Ordis is pleased to see you.",
  "Ordis has been counting stars, Operator. All accounted for.",
  "Optimized.",
  "Ready for action.",
  "Project complete.",
  "Striking!",
] as const;

export function randomOrdisVoiceLine(random: () => number = Math.random) {
  const index = Math.floor(random() * ORDIS_VOICE_LINES.length);
  return ORDIS_VOICE_LINES[index] ?? ORDIS_VOICE_LINES[0];
}
