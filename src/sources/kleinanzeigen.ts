import * as cheerio from "cheerio";
import type { Listing } from "../types.js";
import { config, type SearchConfig, type SearchProfile } from "../config.js";
import { parseGermanNumber } from "../parse.js";
import { matchAmenities } from "../amenities.js";
import { extractDetailText, parseAreaFromText } from "./kleinanzeigenDetail.js";
import { loadCache, saveCache } from "./kleinanzeigenCache.js";

const BASE = "https://www.kleinanzeigen.de";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const ENRICH_DELAY_MS = 600;   // politeness between detail-page fetches
const MAX_ENRICH = 40;         // cap on uncached detail fetches per run

function slugify(query: string): string {
  return query
    .toLowerCase()
    .replace(/[äöü]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue" })[c] ?? c)
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function searchUrl(query: string, cfg: SearchConfig): string {
  return `${BASE}/s-${slugify(query)}/k0l${cfg.kleinanzeigenLocationId}r${cfg.kleinanzeigenRadiusKm}`;
}

function parseListings(html: string, profileKey: string): Listing[] {
  const $ = cheerio.load(html);
  const out: Listing[] = [];
  $("article.aditem").each((_, el) => {
    const a = $(el);
    const id = a.attr("data-adid");
    const href = a.attr("data-href");
    if (!id || !href) return;
    const title = (a.find("h2 a.ellipsis").text() || a.find("a.ellipsis").first().text()).trim();
    const priceText = a.find(".aditem-main--middle--price-shipping--price").text().trim();
    const location = a.find(".aditem-main--top--left").text().replace(/\s+/g, " ").trim();
    out.push({
      source: "kleinanzeigen",
      profile: profileKey,
      id,
      title: title || "(ohne Titel)",
      price: priceText || null,
      priceEur: parseGermanNumber(priceText),
      areaSqm: null,
      address: location || null,
      url: BASE + href,
    });
  });
  return out;
}

/** Fill area + amenity tags for each listing from its detail page, caching by id. */
async function enrich(listings: Listing[], cfg: SearchConfig): Promise<void> {
  const cache = await loadCache();
  let fetched = 0;
  for (const l of listings) {
    const hit = cache[l.id];
    if (hit) {
      l.areaSqm = hit.areaSqm;
      l.tags = hit.tags;
      continue;
    }
    if (fetched >= MAX_ENRICH) continue;
    try {
      const res = await fetch(l.url, {
        headers: { "User-Agent": UA, "Accept-Language": "de-DE,de;q=0.9" },
      });
      if (!res.ok) {
        console.warn(`Kleinanzeigen detail "${l.url}" failed: ${res.status}`);
        continue;
      }
      const text = extractDetailText(await res.text());
      const areaSqm = parseAreaFromText(text);
      const tags = matchAmenities(text, cfg.amenityKeywords);
      l.areaSqm = areaSqm;
      l.tags = tags;
      cache[l.id] = { areaSqm, tags };
      fetched++;
      await new Promise((r) => setTimeout(r, ENRICH_DELAY_MS));
    } catch (e) {
      console.warn(`Kleinanzeigen detail "${l.url}" error:`, (e as Error).message);
    }
  }
  await saveCache(cache);
}

/** Fetch listings from eBay Kleinanzeigen for the given profile. */
export async function fetchListings(profile: SearchProfile, cfg: SearchConfig = config): Promise<Listing[]> {
  const byId = new Map<string, Listing>();
  for (const query of profile.kleinanzeigenQueries) {
    const res = await fetch(searchUrl(query, cfg), {
      headers: { "User-Agent": UA, "Accept-Language": "de-DE,de;q=0.9" },
    });
    if (!res.ok) {
      console.warn(`Kleinanzeigen query "${query}" failed: ${res.status}`);
      continue;
    }
    for (const l of parseListings(await res.text(), profile.key)) byId.set(l.id, l);
    await new Promise((r) => setTimeout(r, 800)); // be polite between requests
  }
  const listings = [...byId.values()];
  if (profile.enrichAmenities) await enrich(listings, cfg);
  return listings;
}

// `npm run kleinanzeigen` — run this adapter standalone.
if (import.meta.url === `file://${process.argv[1]}`) {
  const profile = config.profiles[0];
  if (!profile) throw new Error("No profiles configured.");
  const listings = await fetchListings(profile);
  console.log(`Kleinanzeigen: ${listings.length} listings in ${config.regionLabel}`);
  for (const l of listings.slice(0, 8)) {
    console.log(`- [${l.price ?? "?"}] ${l.title} | ${l.address} | ${l.url}`);
  }
}
