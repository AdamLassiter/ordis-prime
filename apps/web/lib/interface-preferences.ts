import type { PlayerPreferences } from "@ordis-prime/db";

const DEFAULT_PREFERENCES: PlayerPreferences = {
  collectionLayout: "cards",
  displayDensity: "comfortable",
  collectionHighlighting: "badges",
};

export function interfacePreferenceClasses(
  preferences: PlayerPreferences = DEFAULT_PREFERENCES,
) {
  return [
    `layout-${preferences.collectionLayout}`,
    `density-${preferences.displayDensity}`,
    `highlighting-${preferences.collectionHighlighting}`,
  ].join(" ");
}
