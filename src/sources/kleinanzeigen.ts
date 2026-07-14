import * as cheerio from "cheerio";
import type { Listing } from "../types.js";
import { config, type SearchConfig, type SearchProfile } from "../config.js";
import { parseGermanNumber } from "../parse.js";
import { DE_HEADERS } from "./http.js";

const BASE = "https://www.kleinanzeigen.de";

function slugify(query: string): string {
  return query
    .toLowerCase()
    .replace(/[äöü]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue" })[c] ?? c)
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function searchUrl(query: string, cfg: SearchConfig): string {
  return `${BASE}/s-${slugify(query)}/k0l${cfg.kleinanzeigenLocationId}r${cfg.kleinanzeigenRadiusKm}`;
}

/**
 * Distance in km that Kleinanzeigen prints next to a list-view location, e.g. "(0.6 km)",
 * "(4 km)", "(ca. 50 km)". Returns null when no distance is shown (an ad at the exact search
 * center, or a non-radius result). Decimals may use "." or ",".
 */
export function distanceKmFromLocation(location: string): number | null {
  const m = location.match(/\(\s*(?:ca\.?\s*)?(\d+(?:[.,]\d+)?)\s*km\s*\)/i);
  return m?.[1] ? parseFloat(m[1].replace(",", ".")) : null;
}

export function parseListings(html: string, profileKey: string, radiusKm: number): Listing[] {
  const $ = cheerio.load(html);
  const out: Listing[] = [];
  $("article.aditem").each((_, el) => {
    const a = $(el);
    const id = a.attr("data-adid");
    const href = a.attr("data-href");
    if (!id || !href) return;
    // Drop "Gesuche": Kleinanzeigen tags wanted/search ads with a .simpletag reading
    // "Gesuch". Someone seeking a room is not a room on offer, so it must not alert (CL-269).
    if (a.find(".simpletag").toArray().some((t) => $(t).text().trim() === "Gesuch")) return;
    const title = (a.find("h2 a.ellipsis").text() || a.find("a.ellipsis").first().text()).trim();
    const priceText = a.find(".aditem-main--middle--price-shipping--price").text().trim();
    const location = a.find(".aditem-main--top--left").text().replace(/\s+/g, " ").trim();
    // Kleinanzeigen pads a sparse radius search with "Anzeigen in der Umgebung" beyond the
    // requested radius (the r-param is a soft hint, not a hard cap). Drop those using the
    // distance it prints; keep listings with no distance shown (don't drop on missing data).
    const distanceKm = distanceKmFromLocation(location);
    if (distanceKm != null && distanceKm > radiusKm) return;
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

/**
 * Fetch list-level listings from eBay Kleinanzeigen for the given profile. Amenity/area
 * enrichment from detail pages is done separately (see Enricher) so the fetch budget can
 * be shared across profiles in a run.
 */
export async function fetchListings(profile: SearchProfile, cfg: SearchConfig = config): Promise<Listing[]> {
  const byId = new Map<string, Listing>();
  for (const query of profile.keywords) {
    try {
      const res = await fetch(searchUrl(query, cfg), { headers: DE_HEADERS });
      if (!res.ok) {
        console.warn(`Kleinanzeigen query "${query}" failed: ${res.status}`);
      } else {
        for (const l of parseListings(await res.text(), profile.key, cfg.kleinanzeigenRadiusKm)) byId.set(l.id, l);
      }
    } catch (e) {
      console.warn(`Kleinanzeigen query "${query}" error:`, e instanceof Error ? e.message : String(e));
    }
    await new Promise((r) => setTimeout(r, 800)); // be polite between requests
  }
  return [...byId.values()];
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
