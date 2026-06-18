import * as cheerio from "cheerio";
import type { Listing } from "../types.js";
import { config, type SearchConfig } from "../config.js";
import { parseGermanNumber } from "../parse.js";

const BASE = "https://www.kleinanzeigen.de";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

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

function parseListings(html: string): Listing[] {
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

/** Fetch chair-rental / salon listings from eBay Kleinanzeigen for the configured region. */
export async function fetchListings(cfg: SearchConfig = config): Promise<Listing[]> {
  const byId = new Map<string, Listing>();
  for (const query of cfg.kleinanzeigenQueries) {
    const res = await fetch(searchUrl(query, cfg), {
      headers: { "User-Agent": UA, "Accept-Language": "de-DE,de;q=0.9" },
    });
    if (!res.ok) {
      console.warn(`Kleinanzeigen query "${query}" failed: ${res.status}`);
      continue;
    }
    for (const l of parseListings(await res.text())) byId.set(l.id, l);
    await new Promise((r) => setTimeout(r, 800)); // be polite between requests
  }
  return [...byId.values()];
}

// `npm run kleinanzeigen` — run this adapter standalone.
if (import.meta.url === `file://${process.argv[1]}`) {
  const listings = await fetchListings();
  console.log(`Kleinanzeigen: ${listings.length} listings in ${config.regionLabel}`);
  for (const l of listings.slice(0, 8)) {
    console.log(`- [${l.price ?? "?"}] ${l.title} | ${l.address} | ${l.url}`);
  }
}
