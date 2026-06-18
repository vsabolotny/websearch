/**
 * Search configuration. Edit the region and caps to match what you're looking for.
 *
 * IS24 uses a radius search around a point: set the city-center latitude/longitude
 * and a radius in km. Look up coordinates for any city (e.g. via Google Maps).
 *
 * Kleinanzeigen uses a numeric location id in its search URLs (e.g. l6411 = München).
 * Find yours via https://www.kleinanzeigen.de/s-ort-empfehlungen.json?query=<city>
 * or by reading the `l<id>` from a search URL on kleinanzeigen.de.
 */
export interface SearchConfig {
  regionLabel: string;

  // --- ImmobilienScout24 (commercial spaces to open your own salon) ---
  /** City-center latitude for the IS24 radius search. */
  is24Lat: number;
  /** City-center longitude for the IS24 radius search. */
  is24Lon: number;
  /** Search radius in km around the IS24 center point. */
  is24RadiusKm: number;
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
  regionLabel: "München",

  is24Lat: 48.1374,
  is24Lon: 11.5755,
  is24RadiusKm: 10,
  is24RealEstateTypes: ["store"],

  kleinanzeigenLocationId: 6411,
  kleinanzeigenRadiusKm: 20,
  kleinanzeigenQueries: ["friseur stuhlmiete", "friseur laden", "kosmetik stuhlmiete"],

  maxPriceEur: 2000,
  minAreaSqm: null,
  maxAreaSqm: 200,
};
