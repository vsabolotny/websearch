import type { Listing, Source } from "./types.js";
import type { SearchProfile } from "./config.js";

/**
 * Cross-portal keyword filtering. Kleinanzeigen searches a profile's keywords
 * natively, so its results already reflect them; the structured portals do not,
 * so we apply the keywords here as a post-fetch include filter. Every portal also
 * honors the profile's excludeKeywords (e.g. dropping "Stuhlmiete" for Salon).
 */

/** Sources that fetch by category/type without a keyword search — filtered by keyword here. */
const STRUCTURED: ReadonlySet<Source> = new Set<Source>([
  "immoscout24",
  "immosuchmaschine",
  "matchoffice",
]);

/** True if `text` contains any of `terms` as a case-insensitive substring. Empty terms = false. */
export function matchesAny(text: string, terms: string[]): boolean {
  if (!terms.length) return false;
  const hay = text.toLowerCase();
  return terms.some((t) => hay.includes(t.toLowerCase()));
}

/**
 * Filter listings by their profile's keywords and excludeKeywords.
 *
 * - Exclude: a listing is dropped if excludeKeywords match its `title + address`.
 *   Applies to every source. (TOP HAIR additionally excludes on the full ad body
 *   in its own adapter, where that text is available.)
 * - Include: for structured sources with non-empty keywords, a listing is kept
 *   only if a keyword matches its `title + address`. Kleinanzeigen (native search
 *   already applied the keywords) and TOP HAIR (own salon-space detection) bypass
 *   the include filter.
 *
 * A listing whose profile is unknown is passed through untouched — profile caps
 * (applyFilters) are responsible for dropping those.
 */
export function applyKeywordFilters(listings: Listing[], profiles: SearchProfile[]): Listing[] {
  const byKey = new Map(profiles.map((p) => [p.key, p]));
  return listings.filter((l) => {
    const profile = byKey.get(l.profile);
    if (!profile) return true;
    const text = `${l.title} ${l.address ?? ""}`;

    if (matchesAny(text, profile.excludeKeywords ?? [])) return false;

    if (STRUCTURED.has(l.source) && profile.keywords.length) {
      if (!matchesAny(text, profile.keywords)) return false;
    }
    return true;
  });
}
