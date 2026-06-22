import type { Listing } from "./types.js";
import type { SearchProfile } from "./config.js";

/**
 * Apply each listing's profile caps. Listings with unknown price/area pass (we don't drop
 * on missing data). A listing whose profile has no caps defined is dropped.
 */
export function applyFilters(listings: Listing[], profiles: SearchProfile[]): Listing[] {
  const capsByKey = new Map(profiles.map((p) => [p.key, p.filters]));
  return listings.filter((l) => {
    const caps = capsByKey.get(l.profile);
    if (!caps) return false;
    if (caps.maxPriceEur != null && l.priceEur != null && l.priceEur > caps.maxPriceEur) return false;
    if (caps.minAreaSqm != null && l.areaSqm != null && l.areaSqm < caps.minAreaSqm) return false;
    if (caps.maxAreaSqm != null && l.areaSqm != null && l.areaSqm > caps.maxAreaSqm) return false;
    return true;
  });
}
