/**
 * Search configuration. Edit the region and caps to match what you're looking for.
 *
 * IS24 `geocode` is a numeric region id in IS24's hierarchy. The default below is
 * Berlin (1276003001). To find yours: run a Gewerbe search on immobilienscout24.de
 * for your city and copy the `geocodes=` value out of the resulting URL.
 *
 * Kleinanzeigen uses a numeric location id in its search URLs (e.g. l3331 = Berlin).
 * Find yours by searching on kleinanzeigen.de and reading the `l<id>` in the URL.
 */
export interface SearchConfig {
  regionLabel: string;

  // --- ImmobilienScout24 (commercial spaces to open your own salon) ---
  /** IS24 mobile-API numeric geocode for the region, e.g. "1276003001" (Berlin). */
  is24Geocode: string;
  /** Commercial real-estate types to watch. "store" = retail/Ladenfläche (best for a salon). */
  is24RealEstateTypes: string[];

  // --- eBay Kleinanzeigen (a chair/room inside an existing salon) ---
  /** Kleinanzeigen location id, e.g. 3331 for Berlin. */
  kleinanzeigenLocationId: number;
  /** Kleinanzeigen radius in km around the location. */
  kleinanzeigenRadiusKm: number;
  /** Keyword searches to run on Kleinanzeigen (each is a separate query). */
  kleinanzeigenQueries: string[];

  // --- Shared filters ---
  /** Max monthly rent in EUR (null = no cap). */
  maxPriceEur: number | null;
  /** Min usable area in m² (null = no min). Salons are small, so this trims big units. */
  minAreaSqm: number | null;
  /** Max usable area in m² (null = no max). */
  maxAreaSqm: number | null;
}

export const config: SearchConfig = {
  regionLabel: "Berlin",

  is24Geocode: "1276003001",
  is24RealEstateTypes: ["store"],

  kleinanzeigenLocationId: 3331,
  kleinanzeigenRadiusKm: 20,
  kleinanzeigenQueries: ["friseur stuhlmiete", "friseur laden", "kosmetik stuhlmiete"],

  maxPriceEur: null,
  minAreaSqm: null,
  maxAreaSqm: 200,
};
