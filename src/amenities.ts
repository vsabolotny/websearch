import type { AmenityKeywords, AmenityTags } from "./types.js";

/** Set a flag for each amenity whose keyword list has a substring match in `text`. */
export function matchAmenities(text: string, kw: AmenityKeywords): AmenityTags {
  const hay = text.toLowerCase();
  const has = (list: string[]): boolean => list.some((k) => hay.includes(k.toLowerCase()));
  const tags: AmenityTags = {};
  if (has(kw.window)) tags.window = true;
  if (has(kw.transit)) tags.transit = true;
  if (has(kw.alwaysAccessible)) tags.alwaysAccessible = true;
  return tags;
}

const LABELS: [keyof AmenityTags, string][] = [
  ["window", "🪟 Fenster"],
  ["transit", "🚇 ÖPNV"],
  ["alwaysAccessible", "🔑 24/7"],
];

/** Human-readable summary of the true flags, e.g. "🪟 Fenster · 🚇 ÖPNV". Empty string if none. */
export function amenitySummary(tags: AmenityTags | undefined): string {
  if (!tags) return "";
  return LABELS.filter(([k]) => tags[k]).map(([, label]) => label).join(" · ");
}
