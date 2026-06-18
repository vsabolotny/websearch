export type Source = "immoscout24" | "kleinanzeigen";

/** A normalized real-estate listing, shared across all source adapters. */
export interface Listing {
  source: Source;
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
}

/** Unique dedup key across sources. */
export function listingKey(l: Pick<Listing, "source" | "id">): string {
  return `${l.source}:${l.id}`;
}
