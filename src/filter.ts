import { config, type SearchConfig } from "./config.js";
import type { Listing } from "./types.js";

/** Apply the shared price/area caps. Listings with unknown values pass (we don't drop on missing data). */
export function applyFilters(listings: Listing[], cfg: SearchConfig = config): Listing[] {
  return listings.filter((l) => {
    if (cfg.maxPriceEur != null && l.priceEur != null && l.priceEur > cfg.maxPriceEur) return false;
    if (cfg.minAreaSqm != null && l.areaSqm != null && l.areaSqm < cfg.minAreaSqm) return false;
    if (cfg.maxAreaSqm != null && l.areaSqm != null && l.areaSqm > cfg.maxAreaSqm) return false;
    return true;
  });
}
