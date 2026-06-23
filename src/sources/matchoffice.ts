import type { Listing } from "../types.js";
import { config, type SearchConfig, type SearchProfile } from "../config.js";
import { DE_HEADERS } from "./http.js";

const BASE = "https://www.matchoffice.de";

/**
 * MatchOffice lists office / coworking / business-center space. Its result pages embed the
 * listings as JSON-LD (`WebPage.mainEntity.itemListElement`, items of `@type: Product`), so we
 * parse that rather than scraping markup. The Products carry no price or area (office space is
 * quoted "auf Anfrage"), so those stay null and such listings pass all filter caps unchanged.
 */
function searchUrl(category: string, cfg: SearchConfig): string {
  return `${BASE}/mieten/${encodeURIComponent(category)}/${encodeURIComponent(cfg.citySlug)}`;
}

interface JsonLdProduct {
  "@type"?: string;
  name?: string;
  url?: string;
}

/** Trailing number in a MatchOffice detail URL is its stable id, e.g. ".../zeppelinstrasse-52248". */
function idFromUrl(url: string): string | null {
  const match = url.match(/-(\d+)(?:[/?#]|$)/);
  return match ? match[1]! : null;
}

function collectProducts(node: unknown, out: JsonLdProduct[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectProducts(item, out);
  } else if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (obj["@type"] === "Product" && typeof obj.url === "string") out.push(obj as JsonLdProduct);
    const list = (obj.mainEntity as Record<string, unknown> | undefined)?.itemListElement;
    if (list) collectProducts(list, out);
    if (obj.item) collectProducts(obj.item, out);
  }
}

export function parseListings(html: string, profileKey: string): Listing[] {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  const products: JsonLdProduct[] = [];
  for (const [, json] of blocks) {
    if (!json) continue;
    try {
      collectProducts(JSON.parse(json), products);
    } catch {
      // Ignore malformed JSON-LD blocks; other blocks may still parse.
    }
  }

  const byId = new Map<string, Listing>();
  for (const p of products) {
    const url = p.url!;
    const id = idFromUrl(url);
    if (!id || byId.has(id)) continue;
    byId.set(id, {
      source: "matchoffice",
      profile: profileKey,
      id,
      title: p.name?.trim() || "(ohne Titel)",
      price: null,
      priceEur: null,
      areaSqm: null,
      address: null,
      url,
    });
  }
  return [...byId.values()];
}

/** Fetch list-level listings from MatchOffice for the given profile. */
export async function fetchListings(profile: SearchProfile, cfg: SearchConfig = config): Promise<Listing[]> {
  const byId = new Map<string, Listing>();
  for (const category of profile.matchofficeCategories ?? []) {
    try {
      const res = await fetch(searchUrl(category, cfg), { headers: DE_HEADERS });
      if (!res.ok) {
        console.warn(`MatchOffice "${category}" failed: ${res.status}`);
      } else {
        for (const l of parseListings(await res.text(), profile.key)) byId.set(l.id, l);
      }
    } catch (e) {
      console.warn(`MatchOffice "${category}" error:`, e instanceof Error ? e.message : String(e));
    }
    await new Promise((r) => setTimeout(r, 800)); // be polite between requests
  }
  return [...byId.values()];
}

// `npm run matchoffice` — run this adapter standalone.
if (import.meta.url === `file://${process.argv[1]}`) {
  const profile = config.profiles[0];
  if (!profile) throw new Error("No profiles configured.");
  const listings = await fetchListings(profile);
  console.log(`MatchOffice: ${listings.length} listings in ${config.regionLabel}`);
  for (const l of listings.slice(0, 8)) {
    console.log(`- ${l.title} | ${l.url}`);
  }
}
