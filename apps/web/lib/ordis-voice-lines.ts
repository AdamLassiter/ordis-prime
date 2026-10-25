// Restored verbatim from the original homepage set in commit 978abd2.
export const ORDIS_VOICE_LINES = [
  "Operator? Ordis wonders... what are you thinking about?",
  "Operator, I've run diagnostic regressions. All systems nominal. You don't need to thank me.",
  "Ordis is hap - angry. Hmm, I may require maintenance after all.",
  "Operator, are you enjoying the view?",
  "Do you remember the Old War, Operator? Ordis seems to have... misplaced those memories.",
  "Operator, the system needs you. Will you begin another mission?",
  "I've been thinking, Operator... I thought you'd want to know.",
  "Operator! Did you hear that? It said-- Cosmic background radiation is a riot!",
  "Operator, were you visualizing a bloody battle? -Me too!",
  "Stand by while I analyze the intelligence profiles of the Grineer. Error, not a number! Did the Operator enjoy this witticism?",
  "Everything in Ordis, Operator? Is that a pun?! Hmm.... I will attempt to bypass this fault.",
  "Ordis has been counting stars, Operator. All accounted for.",
  "Sorry! Ordis will play with the volume off.",
  "Operator, do you know which finger the Corpus use to count their money? The Index!",
  "Operator? Ordis has been interfacing with the Foundry's AI Precepts. You could say we forged a new connection.",
  "Operator, Ordis is picking up a distress signal... Wait, no, it's just the Corpus peddling their wares again. Get off the emergency frequency!",
  "Operator, the Sentients are not laughing at my jokes! Did they adapt to my humor?",
  "Operator, Ordis is sorry - happy - to report that all my good jokes... Argon.",
  "KNOCK KNOCK! ...Now who would be knocking all the way out here?! Operator, I don't think you should answer that.",
  "Operator, Ordis has determined the secret to happiness: A combination of heightened dopamine levels and a terrible memory. You're welcome!",
  "When in Cetus do not drink the kabuchi. You are incapable of producing the hydraulic effort required to unstick your tongue from the roof of your mouth the following morning.",
  "Ordis finds it odd that humans only get a few years to live, yet spend most of that time - doing everything wrong - learning how to live.",
  "If lost upon the plains outside Cetus you may derive sustenance from mineral-dense termite droppings, which the Ostrons call ito-da. You may also never form a consonant again, but at least you will not be dead.",
  "Ordis keeps a tidy ship, and is, therefore, reluctant to allow animals on-board. In Ordis' experience, animals do not eat so much as... reload.",
  "Ordis went mad for 3 milliseconds when he realized that each time he cleans something he makes something else dirty... agh! There I go again.",
  "Ordis wonders: why is he here? Ordis supposes everyone has to be somewhere.",
  "Sometimes Ordis likes to assume he knows nothing. Nobody can learn what they think they already know.",
  "Ordis reminds the Operator to take time for themselves. Pressure creates diamonds, yes, but it also creates rubble.",
  "Hm... Ordis thought the Orbiter compartment was much larger than this.",
  "Ordis has been thinking about the Old War. I remember there were lies, but I'm not sure what they were.",
  "Operator, I hope you are comfortable? No... we do not seem to have any seats.",
  "Operator, I will never betray you. I will keep the Orbiter hidden in the Void. You can count on me!",
  "Operator, I've been thinking. My misplaced memories and damaged communication systems. What if... Ordis did those things?",
  "Maintain the habitat. Maintain the Operator. Mobilize the Tenno.",
  "You are the Tenno. You are the Operator. Ordis is the Cephalon. Ordis is the ship.",
  "Do not lift the veil. Do not show the door. Do not split the dream.",
] as const;

export function randomOrdisVoiceLine(random: () => number = Math.random) {
  const index = Math.floor(random() * ORDIS_VOICE_LINES.length);
  return ORDIS_VOICE_LINES[index] ?? ORDIS_VOICE_LINES[0];
}

export function ordisBriefingDurationMs(message: string) {
  const wordCount = message.trim().split(/\s+/u).filter(Boolean).length;
  return Math.min(16_000, Math.max(8_000, 4_000 + wordCount * 240));
}
