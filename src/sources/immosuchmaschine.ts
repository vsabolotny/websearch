import * as cheerio from "cheerio";
import type { AmenityKeywords, Listing } from "../types.js";
import { config, type SearchConfig, type SearchProfile } from "../config.js";
import { parseGermanNumber } from "../parse.js";
import { matchAmenities } from "../amenities.js";
import { DE_HEADERS } from "./http.js";

const BASE = "https://www.immosuchmaschine.de";

/**
 * immosuchmaschine is a metasearch aggregator (it indexes IS24, ohne-makler, etc.). Its result
 * pages are server-rendered, so we read them with cheerio. We sort newest-first; URL pagination
 * is AJAX-only, so each run reads page 1 — the most recent listings — which is what a recurring
 * monitor wants (dedup + cadence cover the rest).
 */
function searchUrl(category: string, cfg: SearchConfig): string {
  const city = encodeURIComponent(cfg.citySlug);
  return `${BASE}/b/${city}/${encodeURIComponent(category)}?orderby=obj.created_date&sortmode=1`;
}

const clean = (s: string): string => s.replace(/\s+/g, " ").trim();

/** "Landsberger Straße, 80687 München • Büro zu mieten" → "Landsberger Straße, 80687 München". */
function addressFromZipCity(zipcity: string): string | null {
  const addr = clean(zipcity.split("•")[0] ?? "");
  return addr || null;
}

export function parseListings(html: string, profileKey: string, amenityKeywords?: AmenityKeywords): Listing[] {
  const $ = cheerio.load(html);
  const out: Listing[] = [];
  $("li.block_item").each((_, el) => {
    const card = $(el);
    const id = (card.attr("id") ?? "").replace(/^item_/, "");
    if (!id) return;

    // Cards deep-link straight to the partner site (the on-site /expose page was removed). Without a
    // link there is nothing the user can open, so skip rather than emit a dead URL.
    const href = card.find("a.objectLink").first().attr("href");
    if (!href) return;

    // Each card holds a definition list of facts; "—" is the site's "not specified" placeholder.
    const facts = new Map<string, string>();
    card.find("dt").each((_, dt) => {
      const value = clean($(dt).next("dd").text());
      if (value && value !== "—") facts.set(clean($(dt).text()), value);
    });
    const priceText = facts.get("Miete / Monat") ?? null;
    const areaText = facts.get("Nutzfläche") ?? null;

    const title = clean(card.find("h2, h3, h4").first().text());
    const tags = amenityKeywords ? matchAmenities(card.text(), amenityKeywords) : undefined;
    out.push({
      source: "immosuchmaschine",
      profile: profileKey,
      id,
      title: title || "(ohne Titel)",
      price: priceText,
      priceEur: parseGermanNumber(priceText),
      areaSqm: parseGermanNumber(areaText),
      address: addressFromZipCity(card.find(".data_zipcity").first().text()),
      url: href,
      ...(tags && Object.keys(tags).length ? { tags } : {}),
    });
  });
  return out;
}

/** Fetch list-level listings from immosuchmaschine for the given profile. */
export async function fetchListings(profile: SearchProfile, cfg: SearchConfig = config): Promise<Listing[]> {
  const byId = new Map<string, Listing>();
  for (const category of profile.immosuchmaschineCategories ?? []) {
    try {
      const res = await fetch(searchUrl(category, cfg), { headers: DE_HEADERS });
      if (!res.ok) {
        console.warn(`immosuchmaschine "${category}" failed: ${res.status}`);
      } else {
        for (const l of parseListings(await res.text(), profile.key, cfg.amenityKeywords)) byId.set(l.id, l);
      }
    } catch (e) {
      console.warn(`immosuchmaschine "${category}" error:`, e instanceof Error ? e.message : String(e));
    }
    await new Promise((r) => setTimeout(r, 800)); // be polite between requests
  }
  return [...byId.values()];
}

// `npm run immosuchmaschine` — run this adapter standalone.
if (import.meta.url === `file://${process.argv[1]}`) {
  const profile = config.profiles[0];
  if (!profile) throw new Error("No profiles configured.");
  const listings = await fetchListings(profile);
  console.log(`immosuchmaschine: ${listings.length} listings in ${config.regionLabel}`);
  for (const l of listings.slice(0, 8)) {
    console.log(`- [${l.priceEur ?? "?"}€ ${l.areaSqm ?? "?"}m²] ${l.title}`);
    console.log(`    📍 ${l.address ?? "—"} | ${l.url}`);
  }
}
