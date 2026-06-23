import { DE_HEADERS } from "./http.js";
import { loadCache, saveCache, type CacheFile } from "./kleinanzeigenCache.js";
import { extractDetailText, parseAreaFromText } from "./kleinanzeigenDetail.js";
import { matchAmenities } from "../amenities.js";
import type { AmenityKeywords, Listing } from "../types.js";

export const ENRICH_DELAY_MS = 600; // politeness between detail-page fetches
export const MAX_ENRICH = 40; // cap on detail fetches per run (shared across profiles)

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface EnricherOptions {
  cachePath?: string;
  maxFetches?: number;
  delayMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/** Hash of the keyword set; cached entries are discarded when it changes. */
export function keywordsHash(kw: AmenityKeywords): string {
  return JSON.stringify(kw);
}

/**
 * Fills `areaSqm` + amenity `tags` on Kleinanzeigen listings from their detail page.
 * One instance per run: it shares a single cache and a single fetch budget across all
 * `enrich()` calls, so the politeness cap holds even with multiple profiles.
 */
export class Enricher {
  private cache: CacheFile | null = null;
  private remaining: number;
  private fetched = 0;
  private readonly delayMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly kw: AmenityKeywords,
    private readonly opts: EnricherOptions = {},
  ) {
    this.remaining = opts.maxFetches ?? MAX_ENRICH;
    this.delayMs = opts.delayMs ?? ENRICH_DELAY_MS;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  private async ensureCache(): Promise<CacheFile> {
    if (!this.cache) {
      const loaded = await loadCache(this.opts.cachePath);
      const hash = keywordsHash(this.kw);
      this.cache = loaded.keywordsHash === hash ? loaded : { keywordsHash: hash, entries: {} };
    }
    return this.cache;
  }

  async enrich(listings: Listing[]): Promise<void> {
    const cache = await this.ensureCache();
    for (const l of listings) {
      const hit = cache.entries[l.id];
      if (hit) {
        l.areaSqm = hit.areaSqm;
        l.tags = hit.tags;
        continue;
      }
      if (this.remaining <= 0) continue;
      if (this.fetched > 0) await this.sleep(this.delayMs); // gap between fetches, never after the last
      this.remaining--;
      this.fetched++;
      try {
        const res = await this.fetchImpl(l.url, { headers: DE_HEADERS });
        if (!res.ok) {
          console.warn(`Kleinanzeigen detail "${l.url}" failed: ${res.status}`);
          // A gone ad won't come back — cache it so it never burns the budget again.
          if (res.status === 404) cache.entries[l.id] = { areaSqm: null, tags: {} };
          continue;
        }
        const text = extractDetailText(await res.text());
        const areaSqm = parseAreaFromText(text);
        const tags = matchAmenities(text, this.kw);
        l.areaSqm = areaSqm;
        l.tags = tags;
        cache.entries[l.id] = { areaSqm, tags };
      } catch (e) {
        console.warn(`Kleinanzeigen detail "${l.url}" error:`, e instanceof Error ? e.message : String(e));
      }
    }
  }

  /** Persist the cache once, only if anything was fetched. */
  async flush(): Promise<void> {
    if (this.cache && this.fetched > 0) await saveCache(this.cache, this.opts.cachePath);
  }
}
