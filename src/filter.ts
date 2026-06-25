import type { Listing } from "./types.js";
import type { SearchProfile } from "./config.js";

/**
 * Apply each listing's profile caps. A listing whose profile has no caps defined is dropped.
 * When a profile sets a price cap, listings with unknown price are dropped too — an "auf
 * Anfrage" listing can't be confirmed within budget (CL-264). Unknown area still passes.
 */
export function applyFilters(listings: Listing[], profiles: SearchProfile[]): Listing[] {
  const capsByKey = new Map(profiles.map((p) => [p.key, p.filters]));
  return listings.filter((l) => {
    const caps = capsByKey.get(l.profile);
    if (!caps) return false;
    if (caps.maxPriceEur != null && (l.priceEur == null || l.priceEur > caps.maxPriceEur)) return false;
    if (caps.minAreaSqm != null && l.areaSqm != null && l.areaSqm < caps.minAreaSqm) return false;
    if (caps.maxAreaSqm != null && l.areaSqm != null && l.areaSqm > caps.maxAreaSqm) return false;
    return true;
  });
}
