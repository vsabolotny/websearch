import type { Listing } from "./types.js";
import type { SearchProfile } from "./config.js";

/**
 * Upper area bound for admitting a listing that shows no price, used only when the profile
 * sets no maxAreaSqm of its own. Small sublets are the ads most likely to omit a price, so we
 * no longer drop them outright (they were the bulk of what CL-264 silently cost us) — but
 * without any bound, "room" (which has no maxAreaSqm) would let a 6810 m² hall through on the
 * strength of a missing price alone. A room-sized ceiling keeps the trade-off honest.
 */
const UNPRICED_MAX_AREA_SQM = 100;

/**
 * Apply each listing's profile caps. A listing whose profile has no caps defined is dropped.
 *
 * Price: a listing over the cap is dropped. A listing with unknown price ("auf Anfrage") is
 * kept only when its area is known and room-sized — it can't be confirmed within budget, but
 * dropping every one of them (the original CL-264 rule) lost too many genuine small sublets.
 *
 * Area: unknown area still passes when the price is known; it is disqualifying only for the
 * unknown-price case above, where area is the sole remaining evidence.
 */
export function applyFilters(listings: Listing[], profiles: SearchProfile[]): Listing[] {
  const capsByKey = new Map(profiles.map((p) => [p.key, p.filters]));
  return listings.filter((l) => {
    const caps = capsByKey.get(l.profile);
    if (!caps) return false;

    if (caps.maxPriceEur != null) {
      if (l.priceEur == null) {
        if (l.areaSqm == null) return false;
        if (l.areaSqm > (caps.maxAreaSqm ?? UNPRICED_MAX_AREA_SQM)) return false;
      } else if (l.priceEur > caps.maxPriceEur) {
        return false;
      }
    }

    if (caps.minAreaSqm != null && l.areaSqm != null && l.areaSqm < caps.minAreaSqm) return false;
    if (caps.maxAreaSqm != null && l.areaSqm != null && l.areaSqm > caps.maxAreaSqm) return false;
    return true;
  });
}
