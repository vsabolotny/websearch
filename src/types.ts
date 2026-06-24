export type Source = "immoscout24" | "kleinanzeigen" | "immosuchmaschine" | "matchoffice" | "tophair";

/** What a run reports: "new" = only listings unseen since last run; "full" = all current matches. */
export type ReportMode = "new" | "full";

/** A normalized real-estate listing, shared across all source adapters. */
export interface Listing {
  source: Source;
  /** Which search profile matched this listing, e.g. "room". */
  profile: string;
  /** Source-native id, unique within that source. */
  id: string;
  title: string;
  /** Free-text price as shown (e.g. "850 €", "VB", "Auf Anfrage"). */
  price: string | null;
  /** Numeric price in EUR if parseable, else null. Used for filtering. */
  priceEur: number | null;
  /** Living/usable area in m² if known. */
  areaSqm: number | null;
  address: string | null;
  url: string;
  /** Amenity flags from description enrichment (Kleinanzeigen only; undefined elsewhere). */
  tags?: AmenityTags;
}

/** Which informational amenities a listing's text mentions. Only true flags are set. */
export interface AmenityTags {
  window?: boolean;
  transit?: boolean;
  alwaysAccessible?: boolean;
}

/** Keyword lists used to detect amenities in free-text descriptions (matched case-insensitively). */
export interface AmenityKeywords {
  window: string[];
  transit: string[];
  alwaysAccessible: string[];
}

/**
 * Unique dedup key. Namespaced by profile so the same ad found by two profiles is
 * tracked independently (otherwise a second profile would never alert on a shared ad).
 */
export function listingKey(l: Pick<Listing, "profile" | "source" | "id">): string {
  return `${l.profile}:${l.source}:${l.id}`;
}
