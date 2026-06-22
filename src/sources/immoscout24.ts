import type { Listing } from "../types.js";
import { config, type SearchConfig, type SearchProfile } from "../config.js";
import { parseGermanNumber } from "../parse.js";

const BASE = "https://api.mobile.immobilienscout24.de";
const HEADERS = {
  "User-Agent": "ImmoScout_27.12_26.2_._",
  Accept: "application/json",
};

const MAX_PAGES = 5; // safety cap; dedup + caps keep alert volume sane

interface Is24Attribute {
  label?: string;
  value?: string;
}
interface Is24Item {
  id?: string;
  title?: string;
  address?: { line?: string };
  attributes?: Is24Attribute[];
}
interface Is24ListResponse {
  numberOfPages?: number;
  resultListItems?: { type?: string; item?: Is24Item }[];
}

/** Extract { price, area } from the attributes array (values like "32 € /m²", "846 m²"). */
function readAttributes(attrs: Is24Attribute[] = []): {
  priceText: string | null;
  perSqm: number | null;
  areaSqm: number | null;
} {
  let priceText: string | null = null;
  let perSqm: number | null = null;
  let areaSqm: number | null = null;
  for (const a of attrs) {
    const v = a.value ?? "";
    if (v.includes("€")) {
      priceText = v.trim();
      if (v.includes("/m")) perSqm = parseGermanNumber(v);
    } else if (v.includes("m²")) {
      areaSqm = parseGermanNumber(v);
    }
  }
  return { priceText, perSqm, areaSqm };
}

function toListing(item: Is24Item, profileKey: string): Listing | null {
  if (!item.id) return null;
  const { priceText, perSqm, areaSqm } = readAttributes(item.attributes);
  let priceEur: number | null = null;
  if (perSqm != null && areaSqm != null) priceEur = Math.round(perSqm * areaSqm);
  else if (priceText && !priceText.includes("/m")) priceEur = parseGermanNumber(priceText);

  return {
    source: "immoscout24",
    profile: profileKey,
    id: item.id,
    title: item.title?.trim() || "(ohne Titel)",
    price: priceText,
    priceEur,
    areaSqm,
    address: item.address?.line?.trim() || null,
    url: `https://www.immobilienscout24.de/expose/${item.id}`,
  };
}

async function fetchPage(realEstateType: string, cfg: SearchConfig, page: number): Promise<Is24ListResponse> {
  const geo = `${cfg.is24Lat};${cfg.is24Lon};${cfg.is24RadiusKm}.0`;
  const url =
    `${BASE}/search/list?searchType=radius&realestatetype=${encodeURIComponent(realEstateType)}` +
    `&geocoordinates=${encodeURIComponent(geo)}&pagenumber=${page}&pagesize=20`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ supportedResultListType: [], userData: {} }),
  });
  if (!res.ok) {
    throw new Error(`IS24 ${realEstateType} page ${page} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as Is24ListResponse;
}

/** Fetch commercial listings from ImmobilienScout24 for the given profile. */
export async function fetchListings(profile: SearchProfile, cfg: SearchConfig = config): Promise<Listing[]> {
  const out: Listing[] = [];
  const seen = new Set<string>();
  for (const type of profile.is24RealEstateTypes) {
    const first = await fetchPage(type, cfg, 1);
    const pages = Math.min(first.numberOfPages ?? 1, MAX_PAGES);
    for (let page = 1; page <= pages; page++) {
      const data = page === 1 ? first : await fetchPage(type, cfg, page);
      for (const r of data.resultListItems ?? []) {
        if (r.type !== "EXPOSE_RESULT" || !r.item) continue;
        const listing = toListing(r.item, profile.key);
        if (listing && !seen.has(listing.id)) {
          seen.add(listing.id);
          out.push(listing);
        }
      }
    }
  }
  return out;
}

// Allow running this adapter standalone: `npm run is24`
if (import.meta.url === `file://${process.argv[1]}`) {
  const profile = config.profiles[0];
  if (!profile) throw new Error("No profiles configured.");
  const listings = await fetchListings(profile);
  console.log(`IS24: ${listings.length} listings in ${config.regionLabel}`);
  for (const l of listings.slice(0, 8)) {
    console.log(`- [${l.priceEur ?? "?"}€ ${l.areaSqm ?? "?"}m²] ${l.title} | ${l.address} | ${l.url}`);
  }
}
