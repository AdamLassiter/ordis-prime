import path from "node:path";
import { ManualRankingAdapter } from "./adapters/manual-ranking.ts";

export const BUNDLED_MANUAL_RANKING_FILES = [
  "overframe-warframes.yaml",
  "overframe-primary-weapons.yaml",
  "overframe-secondary-weapons.yaml",
  "overframe-melee-weapons.yaml",
  "overframe-archwing.yaml",
  "overframe-companions.yaml",
  "overframe-helminth-abilities.yaml",
  "creator-brozime-warframes-2026.yaml",
  "creator-knightmareframe-warframes-2026-average.yaml",
  "creator-knightmareframe-warframes-2026-high-investment.yaml",
  "creator-salt-prime-coda-weapons-2025.yaml",
  "creator-salt-prime-kuva-weapons-2025.yaml",
  "creator-salt-prime-tenet-weapons-2025.yaml",
  "creator-salt-prime-primary-primes-2026.yaml",
  "creator-salt-prime-secondary-primes-2026.yaml",
  "creator-salt-prime-melee-primes-2026.yaml",
] as const;

export async function loadBundledManualRankingAdapters(
  manualDataDirectory: string,
): Promise<ManualRankingAdapter[]> {
  return Promise.all(
    BUNDLED_MANUAL_RANKING_FILES.map((filename) =>
      ManualRankingAdapter.fromFile(path.join(manualDataDirectory, filename)),
    ),
  );
}
