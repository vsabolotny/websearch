import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import type { AmenityKeywords, Listing } from "../types.js";
import { config, type SearchConfig, type SearchProfile } from "../config.js";
import { parseGermanNumber } from "../parse.js";
import { matchAmenities } from "../amenities.js";
import { DE_HEADERS } from "./http.js";

const BASE = "https://www.tophair.de";
const BOARD_PATH = "/kleinanzeigen/";

/**
 * TOP HAIR Kleinanzeigen is a hairdresser trade-magazine classifieds board. Unlike the structured
 * portals it is a single WordPress page: every ad is one `.wp-block-stackable-column` with a
 * free-text body and no price/area/location fields. We parse all ads from the server-rendered HTML
 * and keep only the ones that (a) mention a configured region and (b) offer a room or chair actually
 * for rent — not a business sale, take-over or whole-lease hand-over, equipment, or a job posting.
 * Sale/take-over ads were dropped in CL-264's sibling fix CL-267: someone searching for a room to
 * rent doesn't want "Salon zu verkaufen" / "Nachfolger gesucht" / "Nachmieter gesucht" listings.
 */
export interface ParseOptions {
  /** Keep only ads whose text contains one of these (substring, case-insensitive). Empty = keep all. */
  regionKeywords?: string[];
  /** When supplied, tag ads with detected amenities from their text. */
  amenityKeywords?: AmenityKeywords;
}

const clean = (s: string): string => s.replace(/\s+/g, " ").trim();

const PREMISES =
  /(friseursalon|frisörsalon|salon|ladenlokal|ladenfläche|laden|gewerbefläche|gewerberaum|gewerbeimmobilie|gewerbe|geschäftsfläche|geschäft|studio|räumlichkeit|behandlungsraum|\braum\b|fläche|\bstuhl)/;
// A room or chair actually available to rent — the only thing we alert on (CL-267).
const RENT =
  /(stuhlmiete|stuhlmiet|stuhlplatz|zu vermieten|vermietung|vermieten|zu mieten|zur miete|mietraum|mietfläche|untermiete|untervermiet|co.?working|coworking)/;
// Business sale / take-over / whole-lease hand-over — explicitly excluded (CL-267). A salon sold or
// passed to a successor (incl. "Nachmieter gesucht": taking over someone's entire lease) is not a
// room to rent. Checked before RENT so "Stuhlmiete frei, suche Nachmieter" — whose real intent is to
// hand over the whole salon — is dropped despite the chair mention.
const SALE =
  /(übernahme|übernehmen|übergabe|nachfolge|nachfolger|nachmieter|abzugeben|zu verkaufen|zum verkauf|verkauft|verkaufe|ablöse|ablösefrei|verpachten|verpacht|\bpacht\b|teilhaber|investor|salonauflösung)/;
const EQUIPMENT =
  /(registrierkasse|bedienstuhl|bedienstühle|friseurstuhl|barberstuhl|trockenhaube|haarschneideschere|\bschere\b|waschbecken|waschliege|klimazone|analysegerät|ultraschallgerät|arbeitswagen|friseurwagen|frisierplatz|pumpstuhl|haarverlängerung|\bmöbel\b|\bspiegel\b|\btrockner\b|\bkasse\b|einrichtung|haarfarbe|\bgerät\b)/;

/**
 * Decide whether an ad offers a room or chair to rent. Ordered so the unambiguous drops win first:
 * an equipment-dominated title drops out, any sale / take-over / lease hand-over signal drops the ad
 * (a business changing hands isn't a rental), and what's left must pair a premises noun with a rental
 * signal. Heuristic by nature — the board has no structured type — so a few may slip through or be
 * missed; we err toward dropping ambiguous take-overs rather than alerting on them.
 */
export function isSalonSpaceAd(title: string, body: string): boolean {
  const t = title.toLowerCase();
  // Signals can sit in the title or the body, so match against both (the live body already
  // includes the title, but keep this robust for callers that pass them separately).
  const hay = `${t} ${body.toLowerCase()}`;
  if (EQUIPMENT.test(t) && !PREMISES.test(t)) return false;
  if (SALE.test(hay)) return false;
  return PREMISES.test(hay) && RENT.test(hay);
}

/** First "<plz> <city>" mention in free text, e.g. "80687 München". null if none. */
function addressFromText(text: string): string | null {
  const m = text.match(/\b\d{5}\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\-/]+(?:\s[A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\-/]+)?/);
  if (!m) return null;
  // Guard against a 5-digit amount ("55000 Euro") being misread as a postal code + city.
  if (/^\d{5}\s+(?:euro|eur|vb|monat|netto|brutto)\b/i.test(m[0])) return null;
  return clean(m[0]).replace(/[.,;]+$/, "");
}

/** First euro amount as shown, e.g. "490€", "1.000 €", "9.999 EUR". null if none. */
function priceFromText(text: string): string | null {
  const m = text.match(/(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?\s?(?:€|euro|eur)/i);
  return m ? clean(m[0]) : null;
}

/** First area in m²/qm, e.g. "130 m²" -> 130. null if none. */
function areaFromText(text: string): number | null {
  const m = text.match(/(\d{1,4})\s?(?:m²|m2|qm)(?![a-z0-9])/i);
  return m ? parseGermanNumber(m[1]) : null;
}

/** Stable, content-derived id: heading anchors collide, so hash title + body instead. */
function adId(title: string, body: string): string {
  return createHash("sha1").update(`${title}\n${body}`).digest("hex").slice(0, 12);
}

export function parseListings(html: string, profileKey: string, opts: ParseOptions = {}): Listing[] {
  const { regionKeywords = [], amenityKeywords } = opts;
  const region = regionKeywords.map((k) => k.toLowerCase());
  const $ = cheerio.load(html);
  const out: Listing[] = [];
  $(".wp-block-stackable-column").each((_, el) => {
    const card = $(el);
    const heading = card.find(".stk-block-heading").first();
    const title = clean(heading.find(".stk-block-heading__text").text());
    if (!title) return;

    const body = clean(card.text());
    const hay = body.toLowerCase();
    if (region.length && !region.some((k) => hay.includes(k))) return;
    if (!isSalonSpaceAd(title, body)) return;

    const slug = heading.attr("id");
    const price = priceFromText(body);
    const tags = amenityKeywords ? matchAmenities(body, amenityKeywords) : undefined;
    out.push({
      source: "tophair",
      profile: profileKey,
      id: adId(title, body),
      title,
      price,
      priceEur: parseGermanNumber(price),
      areaSqm: areaFromText(body),
      address: addressFromText(body),
      url: slug ? `${BASE}${BOARD_PATH}#${slug}` : `${BASE}${BOARD_PATH}`,
      ...(tags && Object.keys(tags).length ? { tags } : {}),
    });
  });
  return out;
}

/** Fetch München salon-space listings from the TOP HAIR board for an opted-in profile. */
export async function fetchListings(profile: SearchProfile, cfg: SearchConfig = config): Promise<Listing[]> {
  if (!profile.tophairEnabled) return [];
  const byId = new Map<string, Listing>();
  try {
    const res = await fetch(`${BASE}${BOARD_PATH}`, { headers: DE_HEADERS });
    if (!res.ok) {
      console.warn(`tophair failed: ${res.status}`);
    } else {
      const listings = parseListings(await res.text(), profile.key, {
        regionKeywords: cfg.tophairRegionKeywords,
        amenityKeywords: cfg.amenityKeywords,
      });
      for (const l of listings) byId.set(l.id, l);
    }
  } catch (e) {
    console.warn("tophair error:", e instanceof Error ? e.message : String(e));
  }
  return [...byId.values()];
}

// `npm run tophair` — run this adapter standalone.
if (import.meta.url === `file://${process.argv[1]}`) {
  const profile = config.profiles.find((p) => p.tophairEnabled) ?? config.profiles[0];
  if (!profile) throw new Error("No profiles configured.");
  const listings = await fetchListings(profile);
  console.log(`tophair: ${listings.length} salon-space listings in ${config.regionLabel}`);
  for (const l of listings.slice(0, 20)) {
    console.log(`- [${l.priceEur ?? "?"}€ ${l.areaSqm ?? "?"}m²] ${l.title}`);
    console.log(`    📍 ${l.address ?? "—"} | ${l.url}`);
  }
}
