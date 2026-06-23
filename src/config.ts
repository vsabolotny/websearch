/**
 * Search configuration. Region/geo settings are shared; each entry in `profiles` is one
 * search (its own price/size caps and per-source queries) run across every source.
 *
 * IS24 uses a radius search around a point: set the city-center latitude/longitude and a
 * radius in km. Kleinanzeigen uses a numeric location id in its search URLs (l6411 = München).
 * immosuchmaschine and MatchOffice address the city by a URL slug (`citySlug`, e.g. "muenchen").
 */
import type { AmenityKeywords } from "./types.js";

/** Price/size caps for one search profile. null = no bound; unknown listing values pass. */
export interface FilterCaps {
  maxPriceEur: number | null;
  minAreaSqm: number | null;
  maxAreaSqm: number | null;
}

/** One search run across all sources. */
export interface SearchProfile {
  /** Stable key, e.g. "room". */
  key: string;
  /** Short label shown in alerts, e.g. "Raum". */
  label: string;
  filters: FilterCaps;
  /** IS24 commercial real-estate types to query for this profile. */
  is24RealEstateTypes: string[];
  /** Kleinanzeigen keyword searches for this profile. */
  kleinanzeigenQueries: string[];
  /** immosuchmaschine categories to query, e.g. ["gewerbeimmobilien-mieten"]. Empty = skip. */
  immosuchmaschineCategories?: string[];
  /** MatchOffice categories to query, e.g. ["buro"]. Empty = skip (office space has no price/area). */
  matchofficeCategories?: string[];
  /** When true, fetch Kleinanzeigen detail pages to fill area + amenity flags. */
  enrichAmenities: boolean;
}

export interface SearchConfig {
  regionLabel: string;

  // --- shared region / geo ---
  is24Lat: number;
  is24Lon: number;
  is24RadiusKm: number;
  kleinanzeigenLocationId: number;
  kleinanzeigenRadiusKm: number;
  /** City URL slug for immosuchmaschine + MatchOffice, e.g. "muenchen". */
  citySlug: string;

  /** Keyword lists for amenity detection (shared across profiles). */
  amenityKeywords: AmenityKeywords;
  /** The searches to run. */
  profiles: SearchProfile[];
}

export const config: SearchConfig = {
  regionLabel: "München",

  is24Lat: 48.1374,
  is24Lon: 11.5755,
  is24RadiusKm: 10,

  kleinanzeigenLocationId: 6411,
  kleinanzeigenRadiusKm: 20,
  citySlug: "muenchen",

  amenityKeywords: {
    window: ["fenster", "tageslicht", "lichtdurchflutet", "natürliches licht"],
    transit: [
      "u-bahn", "s-bahn", "öpnv", "öffentliche", "bus", "tram", "straßenbahn",
      "haltestelle", "anbindung", "verkehrsanbindung", "bahnhof", "zentral",
    ],
    alwaysAccessible: [
      "24 stunden", "24/7", "24h", "rund um die uhr", "jederzeit zugang",
      "jederzeit zugäng", "eigener schlüssel", "eigenen schlüssel", "schlüssel",
      "wochenende", "nachts",
    ],
  },

  profiles: [
    {
      key: "room",
      label: "Raum",
      filters: { maxPriceEur: 600, minAreaSqm: 15, maxAreaSqm: null },
      is24RealEstateTypes: ["store"],
      kleinanzeigenQueries: [
        "friseur raum mieten",
        "kosmetik raum",
        "behandlungsraum",
        "gewerberaum friseur",
      ],
      // Newest commercial listings, sorted newest-first; the €600 cap keeps only small/cheap rooms.
      immosuchmaschineCategories: ["gewerbeimmobilien-mieten"],
      // Dormant: MatchOffice office space has no price/area, so it can't honor the room caps.
      matchofficeCategories: [],
      enrichAmenities: true,
    },
  ],
};
