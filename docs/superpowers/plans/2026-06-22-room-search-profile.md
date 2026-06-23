# Room Search Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated "room" search (a small commercial unit for a hair-extension business: ≤€600, ≥15 m²) that runs across both ImmobilienScout24 and Kleinanzeigen, with window / transit / 24-7 surfaced as soft informational flags.

**Architecture:** Replace the single shared filter block with named **search profiles**. Each profile owns its filter caps and per-source queries and runs across both sources. This plan fills in the `room` profile; a future `salon` profile slots into the same array. Kleinanzeigen ads are enriched by fetching their detail page once (cached) to fill area and amenity flags; IS24 already reports area and gets no flags.

**Tech Stack:** TypeScript (ESM, `"type": "module"`), `tsx` runner, `cheerio` for HTML, `nodemailer` for email. Tests use the built-in `node:test` runner via `tsx` — no new dependency.

## Global Constraints

- ESM project: **all relative imports use the `.js` suffix** (e.g. `import { x } from "./amenities.js"`), even for `.ts` files. Match existing files.
- `tsconfig.json` is `strict` with `noUncheckedIndexedAccess` — array indexing yields `T | undefined`; guard or assert before use.
- **Keep-unknowns filter rule:** a listing with `priceEur === null` or `areaSqm === null` is **never excluded** by that bound. Only known values that violate a cap drop a listing.
- **Politeness:** between Kleinanzeigen detail-page fetches, wait ~600 ms; enrich at most ~40 uncached ads per run.
- Typecheck must pass at the end of every task: `npm run typecheck`.
- Tests run with: `node --import tsx --test "src/**/*.test.ts"` (added as `npm test` in Task 1). Run a single file with `node --import tsx --test <path>`.
- German UI strings and labels stay German (e.g. label `"Raum"`), matching the existing codebase.

---

## File structure

**Create:**
- `src/amenities.ts` — pure amenity keyword matching + flag summary string.
- `src/amenities.test.ts`
- `src/sources/kleinanzeigenDetail.ts` — pure parsing of a Kleinanzeigen ad detail page (description text + area).
- `src/sources/kleinanzeigenDetail.test.ts`
- `src/sources/kleinanzeigenCache.ts` — load/save the `state/kleinanzeigen-cache.json` enrichment cache.
- `src/sources/kleinanzeigenCache.test.ts`
- `src/filter.test.ts`

**Modify:**
- `src/types.ts` — add `AmenityTags`, `AmenityKeywords`; add `profile` + `tags` to `Listing`.
- `src/config.ts` — restructure to `profiles` array + shared `amenityKeywords`.
- `src/filter.ts` — filter by each listing's profile caps.
- `src/sources/immoscout24.ts` — take a profile; tag listings.
- `src/sources/kleinanzeigen.ts` — take a profile; tag listings; enrich + cache.
- `src/notify/telegram.ts`, `src/notify/email.ts` — render amenity flags.
- `src/index.ts` — iterate profiles × sources.
- `package.json` — add `test` script.
- `README.md`, `SETUP.md` — document profiles, room queries, amenity keywords.

**Operational (Task 6):** delete `state/seen.json` so the first post-deploy run reseeds silently.

---

## Task 1: Amenity matching + test infrastructure

**Files:**
- Modify: `src/types.ts` (add `AmenityTags`, `AmenityKeywords` — additive)
- Create: `src/amenities.ts`, `src/amenities.test.ts`
- Modify: `package.json` (add `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface AmenityTags { window?: boolean; transit?: boolean; alwaysAccessible?: boolean }` (in `types.ts`)
  - `interface AmenityKeywords { window: string[]; transit: string[]; alwaysAccessible: string[] }` (in `types.ts`)
  - `matchAmenities(text: string, kw: AmenityKeywords): AmenityTags`
  - `amenitySummary(tags: AmenityTags | undefined): string`

- [ ] **Step 1: Add the new types to `src/types.ts`** (append after the existing `Listing` interface / before `listingKey`)

```ts
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
```

- [ ] **Step 2: Add the `test` script to `package.json`**

In `"scripts"`, add:

```json
"test": "node --import tsx --test \"src/**/*.test.ts\""
```

- [ ] **Step 3: Write the failing test `src/amenities.test.ts`**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AmenityKeywords } from "./types.js";
import { matchAmenities, amenitySummary } from "./amenities.js";

const kw: AmenityKeywords = {
  window: ["fenster", "tageslicht"],
  transit: ["u-bahn", "haltestelle"],
  alwaysAccessible: ["eigener schlüssel", "24 stunden"],
};

test("matchAmenities sets every flag whose keyword appears (case-insensitive)", () => {
  const tags = matchAmenities("Heller Raum mit FENSTER, U-Bahn nebenan, eigener Schlüssel.", kw);
  assert.deepEqual(tags, { window: true, transit: true, alwaysAccessible: true });
});

test("matchAmenities sets nothing when no keyword matches", () => {
  assert.deepEqual(matchAmenities("Schöner Laden in guter Lage.", kw), {});
});

test("amenitySummary lists only the true flags in fixed order", () => {
  assert.equal(amenitySummary({ window: true, alwaysAccessible: true }), "🪟 Fenster · 🔑 24/7");
});

test("amenitySummary is empty for no tags", () => {
  assert.equal(amenitySummary(undefined), "");
  assert.equal(amenitySummary({}), "");
});
```

- [ ] **Step 4: Run the test, verify it fails**

Run: `node --import tsx --test src/amenities.test.ts`
Expected: FAIL — cannot find module `./amenities.js` / `matchAmenities` is not a function.

- [ ] **Step 5: Implement `src/amenities.ts`**

```ts
import type { AmenityKeywords, AmenityTags } from "./types.js";

/** Set a flag for each amenity whose keyword list has a substring match in `text`. */
export function matchAmenities(text: string, kw: AmenityKeywords): AmenityTags {
  const hay = text.toLowerCase();
  const has = (list: string[]): boolean => list.some((k) => hay.includes(k.toLowerCase()));
  const tags: AmenityTags = {};
  if (has(kw.window)) tags.window = true;
  if (has(kw.transit)) tags.transit = true;
  if (has(kw.alwaysAccessible)) tags.alwaysAccessible = true;
  return tags;
}

const LABELS: [keyof AmenityTags, string][] = [
  ["window", "🪟 Fenster"],
  ["transit", "🚇 ÖPNV"],
  ["alwaysAccessible", "🔑 24/7"],
];

/** Human-readable summary of the true flags, e.g. "🪟 Fenster · 🚇 ÖPNV". Empty string if none. */
export function amenitySummary(tags: AmenityTags | undefined): string {
  if (!tags) return "";
  return LABELS.filter(([k]) => tags[k]).map(([, label]) => label).join(" · ");
}
```

- [ ] **Step 6: Run the test, verify it passes**

Run: `node --import tsx --test src/amenities.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/amenities.ts src/amenities.test.ts package.json
git commit -m "feat: amenity keyword matching + node:test infrastructure"
```

---

## Task 2: Kleinanzeigen detail-page parsing

**Files:**
- Create: `src/sources/kleinanzeigenDetail.ts`, `src/sources/kleinanzeigenDetail.test.ts`

**Interfaces:**
- Consumes: `parseGermanNumber` from `../parse.js`.
- Produces:
  - `extractDetailText(html: string): string` — visible description text of an ad detail page.
  - `parseAreaFromText(text: string): number | null` — first "NN m²/qm" value, else null.

- [ ] **Step 1: Write the failing test `src/sources/kleinanzeigenDetail.test.ts`**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDetailText, parseAreaFromText } from "./kleinanzeigenDetail.js";

test("extractDetailText returns the description block text", () => {
  const html = `<html><body><h1>nav</h1>
    <div id="viewad-description-text">Heller Raum mit Fenster, ca. 18 m².</div></body></html>`;
  assert.equal(extractDetailText(html).trim(), "Heller Raum mit Fenster, ca. 18 m².");
});

test("extractDetailText falls back to body text when no description block", () => {
  const html = `<html><body><p>Schöner Laden, 22 qm.</p></body></html>`;
  assert.match(extractDetailText(html), /Schöner Laden, 22 qm\./);
});

test("parseAreaFromText reads m² and qm", () => {
  assert.equal(parseAreaFromText("Raum, ca. 18 m² groß"), 18);
  assert.equal(parseAreaFromText("20qm Ladenfläche"), 20);
  assert.equal(parseAreaFromText("15,5 m2"), 15.5);
});

test("parseAreaFromText returns null when no area present", () => {
  assert.equal(parseAreaFromText("Schöner Raum, Preis VB"), null);
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `node --import tsx --test src/sources/kleinanzeigenDetail.test.ts`
Expected: FAIL — cannot find module `./kleinanzeigenDetail.js`.

- [ ] **Step 3: Implement `src/sources/kleinanzeigenDetail.ts`**

```ts
import * as cheerio from "cheerio";
import { parseGermanNumber } from "../parse.js";

/** Visible description text of a Kleinanzeigen ad detail page (falls back to the page body). */
export function extractDetailText(html: string): string {
  const $ = cheerio.load(html);
  const desc = $("#viewad-description-text").text().trim();
  const raw = desc || $("body").text();
  return raw.replace(/\s+/g, " ").trim();
}

/** First area value ("18 m²", "20 qm", "15,5 m2") found in the text, in m². Null if none. */
export function parseAreaFromText(text: string): number | null {
  const match = text.match(/(\d[\d.,]*)\s*(?:m²|qm|m2)/i);
  return match ? parseGermanNumber(match[1]) : null;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `node --import tsx --test src/sources/kleinanzeigenDetail.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/sources/kleinanzeigenDetail.ts src/sources/kleinanzeigenDetail.test.ts
git commit -m "feat: parse area and description text from Kleinanzeigen detail pages"
```

---

## Task 3: Enrichment cache

**Files:**
- Create: `src/sources/kleinanzeigenCache.ts`, `src/sources/kleinanzeigenCache.test.ts`

**Interfaces:**
- Consumes: `AmenityTags` from `../types.js`.
- Produces:
  - `interface CacheEntry { areaSqm: number | null; tags: AmenityTags }`
  - `type EnrichmentCache = Record<string, CacheEntry>`
  - `loadCache(path?: string): Promise<EnrichmentCache>`
  - `saveCache(cache: EnrichmentCache, path?: string): Promise<void>`
  - `CACHE_PATH: string` — default path (`state/kleinanzeigen-cache.json`).

- [ ] **Step 1: Write the failing test `src/sources/kleinanzeigenCache.test.ts`**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { loadCache, saveCache } from "./kleinanzeigenCache.js";

test("loadCache returns {} when the file is missing", async () => {
  const path = join(tmpdir(), `ka-cache-missing-${Date.now()}.json`);
  assert.deepEqual(await loadCache(path), {});
});

test("saveCache then loadCache round-trips entries", async () => {
  const path = join(tmpdir(), `ka-cache-roundtrip-${Date.now()}.json`);
  await saveCache({ "123": { areaSqm: 18, tags: { window: true } } }, path);
  assert.deepEqual(await loadCache(path), { "123": { areaSqm: 18, tags: { window: true } } });
  await rm(path, { force: true });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `node --import tsx --test src/sources/kleinanzeigenCache.test.ts`
Expected: FAIL — cannot find module `./kleinanzeigenCache.js`.

- [ ] **Step 3: Implement `src/sources/kleinanzeigenCache.ts`**

```ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AmenityTags } from "../types.js";

export interface CacheEntry {
  areaSqm: number | null;
  tags: AmenityTags;
}
export type EnrichmentCache = Record<string, CacheEntry>;

/** Default on-disk location of the enrichment cache. */
export const CACHE_PATH = fileURLToPath(new URL("../../state/kleinanzeigen-cache.json", import.meta.url));

/** Load the cache; returns {} if the file does not exist or is unreadable. */
export async function loadCache(path: string = CACHE_PATH): Promise<EnrichmentCache> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as EnrichmentCache;
  } catch {
    return {};
  }
}

/** Persist the cache, creating the parent directory if needed. */
export async function saveCache(cache: EnrichmentCache, path: string = CACHE_PATH): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(cache, null, 2) + "\n");
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `node --import tsx --test src/sources/kleinanzeigenCache.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/sources/kleinanzeigenCache.ts src/sources/kleinanzeigenCache.test.ts
git commit -m "feat: enrichment cache for Kleinanzeigen detail lookups"
```

---

## Task 4: Profile-based config, filtering, and source routing

This is the core refactor: it replaces shared filters with per-profile filters and runs the `room` profile across both sources. Kleinanzeigen still returns only list-level data here (no enrichment yet — added in Task 5).

**Files:**
- Modify: `src/types.ts` (add `profile` + `tags` to `Listing`)
- Modify: `src/config.ts` (rewrite to profiles)
- Modify: `src/filter.ts` (rewrite); Create: `src/filter.test.ts`
- Modify: `src/sources/immoscout24.ts`, `src/sources/kleinanzeigen.ts`, `src/index.ts`
- Modify: `src/notify/email.ts` (add `profile` to the standalone test sample so it still typechecks)

**Interfaces:**
- Consumes: `AmenityKeywords` (Task 1), `SearchProfile`/`SearchConfig` (this task).
- Produces:
  - `Listing` gains `profile: string` (required) and `tags?: AmenityTags`.
  - `interface FilterCaps { maxPriceEur: number | null; minAreaSqm: number | null; maxAreaSqm: number | null }`
  - `interface SearchProfile { key: string; label: string; filters: FilterCaps; is24RealEstateTypes: string[]; kleinanzeigenQueries: string[]; enrichAmenities: boolean }`
  - `SearchConfig` exposes `amenityKeywords: AmenityKeywords` and `profiles: SearchProfile[]` (region/geo fields unchanged).
  - `applyFilters(listings: Listing[], profiles: SearchProfile[]): Listing[]`
  - `fetchListings(profile: SearchProfile, cfg?: SearchConfig): Promise<Listing[]>` for both sources.

- [ ] **Step 1: Add `profile` and `tags` to `Listing` in `src/types.ts`**

In the `Listing` interface, add after `source`:

```ts
  /** Which search profile matched this listing, e.g. "room". */
  profile: string;
```

and after `url`:

```ts
  /** Amenity flags from description enrichment (Kleinanzeigen only; undefined elsewhere). */
  tags?: AmenityTags;
```

Add `AmenityTags` to the import-less file by referencing the locally-declared interface (it already lives in this file from Task 1 — no import needed).

- [ ] **Step 2: Write the failing test `src/filter.test.ts`**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Listing } from "./types.js";
import type { SearchProfile } from "./config.js";
import { applyFilters } from "./filter.js";

const room: SearchProfile = {
  key: "room",
  label: "Raum",
  filters: { maxPriceEur: 600, minAreaSqm: 15, maxAreaSqm: null },
  is24RealEstateTypes: ["store"],
  kleinanzeigenQueries: [],
  enrichAmenities: true,
};

function listing(over: Partial<Listing>): Listing {
  return {
    source: "kleinanzeigen", profile: "room", id: "x", title: "t",
    price: null, priceEur: null, areaSqm: null, address: null, url: "u", ...over,
  };
}

test("drops listings over the price cap", () => {
  assert.equal(applyFilters([listing({ priceEur: 700 })], [room]).length, 0);
});
test("keeps listings at or under the price cap", () => {
  assert.equal(applyFilters([listing({ priceEur: 600 })], [room]).length, 1);
});
test("keeps listings with unknown price", () => {
  assert.equal(applyFilters([listing({ priceEur: null })], [room]).length, 1);
});
test("drops listings under the area minimum", () => {
  assert.equal(applyFilters([listing({ areaSqm: 10 })], [room]).length, 0);
});
test("keeps listings at or over the area minimum", () => {
  assert.equal(applyFilters([listing({ areaSqm: 15 })], [room]).length, 1);
});
test("keeps listings with unknown area", () => {
  assert.equal(applyFilters([listing({ areaSqm: null })], [room]).length, 1);
});
test("drops listings whose profile has no caps defined", () => {
  assert.equal(applyFilters([listing({ profile: "ghost" })], [room]).length, 0);
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `node --import tsx --test src/filter.test.ts`
Expected: FAIL — `SearchProfile` not exported / `applyFilters` signature mismatch.

- [ ] **Step 4: Rewrite `src/config.ts`**

```ts
/**
 * Search configuration. Region/geo settings are shared; each entry in `profiles` is one
 * search (its own price/size caps and per-source queries) run across every source.
 *
 * IS24 uses a radius search around a point: set the city-center latitude/longitude and a
 * radius in km. Kleinanzeigen uses a numeric location id in its search URLs (l6411 = München).
 */
import type { AmenityKeywords } from "./types.js";

/** Price/size caps for one search profile. null = no bound; unknown listing values pass. */
export interface FilterCaps {
  maxPriceEur: number | null;
  minAreaSqm: number | null;
  maxAreaSqm: number | null;
}

/** One search run across all sources. */
export interface SearchProfile {
  /** Stable key, e.g. "room". */
  key: string;
  /** Short label shown in alerts, e.g. "Raum". */
  label: string;
  filters: FilterCaps;
  /** IS24 commercial real-estate types to query for this profile. */
  is24RealEstateTypes: string[];
  /** Kleinanzeigen keyword searches for this profile. */
  kleinanzeigenQueries: string[];
  /** When true, fetch Kleinanzeigen detail pages to fill area + amenity flags. */
  enrichAmenities: boolean;
}

export interface SearchConfig {
  regionLabel: string;

  // --- shared region / geo ---
  is24Lat: number;
  is24Lon: number;
  is24RadiusKm: number;
  kleinanzeigenLocationId: number;
  kleinanzeigenRadiusKm: number;

  /** Keyword lists for amenity detection (shared across profiles). */
  amenityKeywords: AmenityKeywords;
  /** The searches to run. */
  profiles: SearchProfile[];
}

export const config: SearchConfig = {
  regionLabel: "München",

  is24Lat: 48.1374,
  is24Lon: 11.5755,
  is24RadiusKm: 10,

  kleinanzeigenLocationId: 6411,
  kleinanzeigenRadiusKm: 20,

  amenityKeywords: {
    window: ["fenster", "tageslicht", "lichtdurchflutet", "natürliches licht"],
    transit: [
      "u-bahn", "s-bahn", "öpnv", "öffentliche", "bus", "tram", "straßenbahn",
      "haltestelle", "anbindung", "verkehrsanbindung", "bahnhof", "zentral",
    ],
    alwaysAccessible: [
      "24 stunden", "24/7", "24h", "rund um die uhr", "jederzeit zugang",
      "jederzeit zugäng", "eigener schlüssel", "eigenen schlüssel", "schlüssel",
      "wochenende", "nachts",
    ],
  },

  profiles: [
    {
      key: "room",
      label: "Raum",
      filters: { maxPriceEur: 600, minAreaSqm: 15, maxAreaSqm: null },
      is24RealEstateTypes: ["store"],
      kleinanzeigenQueries: [
        "friseur raum mieten",
        "kosmetik raum",
        "behandlungsraum",
        "gewerberaum friseur",
      ],
      enrichAmenities: true,
    },
  ],
};
```

- [ ] **Step 5: Rewrite `src/filter.ts`**

```ts
import type { Listing } from "./types.js";
import type { SearchProfile } from "./config.js";

/**
 * Apply each listing's profile caps. Listings with unknown price/area pass (we don't drop
 * on missing data). A listing whose profile has no caps defined is dropped.
 */
export function applyFilters(listings: Listing[], profiles: SearchProfile[]): Listing[] {
  const capsByKey = new Map(profiles.map((p) => [p.key, p.filters]));
  return listings.filter((l) => {
    const caps = capsByKey.get(l.profile);
    if (!caps) return false;
    if (caps.maxPriceEur != null && l.priceEur != null && l.priceEur > caps.maxPriceEur) return false;
    if (caps.minAreaSqm != null && l.areaSqm != null && l.areaSqm < caps.minAreaSqm) return false;
    if (caps.maxAreaSqm != null && l.areaSqm != null && l.areaSqm > caps.maxAreaSqm) return false;
    return true;
  });
}
```

- [ ] **Step 6: Run the filter test, verify it passes**

Run: `node --import tsx --test src/filter.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Update `src/sources/immoscout24.ts` to take a profile**

Change `toListing` to accept the profile key and stamp it:

```ts
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
```

Change `fetchListings` signature and the real-estate-type source + `toListing` call:

```ts
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
```

Update the import line and the standalone block at the bottom:

```ts
import { config, type SearchConfig, type SearchProfile } from "../config.js";
```

```ts
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
```

- [ ] **Step 8: Update `src/sources/kleinanzeigen.ts` to take a profile (no enrichment yet)**

Update the import:

```ts
import { config, type SearchConfig, type SearchProfile } from "../config.js";
```

Change `parseListings` to stamp the profile key:

```ts
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
```

Change `fetchListings`:

```ts
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
  return [...byId.values()];
}
```

Update the standalone block:

```ts
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
```

- [ ] **Step 9: Update the orchestrator `src/index.ts`**

Replace the `SOURCES` constant and `gather` function:

```ts
const SOURCES: { name: string; fetch: (p: SearchProfile, cfg?: SearchConfig) => Promise<Listing[]> }[] = [
  { name: "ImmobilienScout24", fetch: fetchIs24 },
  { name: "Kleinanzeigen", fetch: fetchKleinanzeigen },
];
```

```ts
async function gather(): Promise<Listing[]> {
  const all: Listing[] = [];
  for (const profile of config.profiles) {
    for (const s of SOURCES) {
      try {
        const listings = await s.fetch(profile);
        console.log(`${profile.key}/${s.name}: ${listings.length} listings`);
        all.push(...listings);
      } catch (e) {
        console.error(`${profile.key}/${s.name} failed:`, (e as Error).message);
      }
    }
  }
  return all;
}
```

Update the import to bring in the profile/config types, and the `applyFilters` call:

```ts
import { config, type SearchConfig, type SearchProfile } from "./config.js";
```

In `main`, change:

```ts
  const matches = applyFilters(await gather(), config.profiles);
```

- [ ] **Step 10: Fix the `src/notify/email.ts` standalone sample**

`Listing.profile` is now required, so the sample listing in the `email-test` block no longer typechecks. Add `profile: "room",` to that object literal, right after `source: "kleinanzeigen",`:

```ts
      {
        source: "kleinanzeigen",
        profile: "room",
        id: "test",
        title: "Testinserat: Friseur Stuhlmiete",
        price: "750 €",
        priceEur: 750,
        areaSqm: null,
        address: "80333 München, Maxvorstadt",
        url: "https://www.kleinanzeigen.de/",
      },
```

- [ ] **Step 11: Run all tests + typecheck**

Run: `node --import tsx --test "src/**/*.test.ts"`
Expected: PASS (all tests from Tasks 1–4).
Run: `npm run typecheck`
Expected: no errors (including `src/notify/email.ts`).

- [ ] **Step 12: Commit**

```bash
git add src/types.ts src/config.ts src/filter.ts src/filter.test.ts \
  src/sources/immoscout24.ts src/sources/kleinanzeigen.ts src/index.ts src/notify/email.ts
git commit -m "feat: per-profile filters and source routing; add room profile"
```

---

## Task 5: Kleinanzeigen enrichment + amenity flags in alerts

Wire the detail parsing (Task 2), cache (Task 3), and amenity matching (Task 1) into the Kleinanzeigen adapter, and render the flags in both notification channels.

**Files:**
- Modify: `src/sources/kleinanzeigen.ts` (add enrichment)
- Modify: `src/notify/telegram.ts`, `src/notify/email.ts`

**Interfaces:**
- Consumes: `extractDetailText`, `parseAreaFromText` (Task 2); `loadCache`, `saveCache` (Task 3); `matchAmenities`, `amenitySummary` (Task 1).
- Produces: enriched `Listing.areaSqm` + `Listing.tags` for Kleinanzeigen ads when `profile.enrichAmenities` is true.

- [ ] **Step 1: Add enrichment imports + constants to `src/sources/kleinanzeigen.ts`**

After the existing imports:

```ts
import { matchAmenities } from "../amenities.js";
import { extractDetailText, parseAreaFromText } from "./kleinanzeigenDetail.js";
import { loadCache, saveCache } from "./kleinanzeigenCache.js";
```

Near the top (after `UA`):

```ts
const ENRICH_DELAY_MS = 600;   // politeness between detail-page fetches
const MAX_ENRICH = 40;         // cap on uncached detail fetches per run
```

- [ ] **Step 2: Add the `enrich` helper**

```ts
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
```

- [ ] **Step 3: Call `enrich` from `fetchListings`**

In `fetchListings`, before `return [...byId.values()];`, replace the return with:

```ts
  const listings = [...byId.values()];
  if (profile.enrichAmenities) await enrich(listings, cfg);
  return listings;
```

- [ ] **Step 4: Render flags in `src/notify/telegram.ts`**

Add the import:

```ts
import { amenitySummary } from "../amenities.js";
```

In `formatListing`, after the `addr` line and before `return`, add:

```ts
  const flags = amenitySummary(l.tags);
  const flagLine = flags ? `\n${flags}` : "";
```

and change the return to include `flagLine` after `meta`/`addr`:

```ts
  return (
    `🏠 <b>${escapeHtml(l.title)}</b>${meta}${addr}${flagLine}\n` +
    `<i>${SOURCE_LABEL[l.source]}</i> — <a href="${l.url}">Inserat öffnen</a>`
  );
```

(Note: `amenitySummary` output contains no HTML-special characters, so no escaping is needed.)

- [ ] **Step 5: Render flags in `src/notify/email.ts`**

Add the import:

```ts
import { amenitySummary } from "../amenities.js";
```

Extend `meta` to append the flags:

```ts
function meta(l: Listing): string {
  const parts: string[] = [];
  if (l.price) parts.push(l.price);
  if (l.areaSqm != null) parts.push(`${l.areaSqm} m²`);
  if (l.address) parts.push(l.address);
  const flags = amenitySummary(l.tags);
  if (flags) parts.push(flags);
  return parts.join(" · ");
}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Run the full test suite (no regressions)**

Run: `node --import tsx --test "src/**/*.test.ts"`
Expected: PASS (all tests).

- [ ] **Step 8: Manual smoke test (network)**

Run: `npm run kleinanzeigen`
Expected: prints listings; the run completes without throwing. (Detail enrichment populates the cache file `state/kleinanzeigen-cache.json`; area/tags are used by filtering/alerts even though this standalone print doesn't show them.)

If the network is unavailable in the execution environment, skip this step and note it.

- [ ] **Step 9: Commit**

```bash
git add src/sources/kleinanzeigen.ts src/notify/telegram.ts src/notify/email.ts
git commit -m "feat: enrich Kleinanzeigen ads with area + amenity flags and show them in alerts"
```

---

## Task 6: Docs + reseed

**Files:**
- Modify: `README.md`, `SETUP.md`
- Operational: delete `state/seen.json`

**Interfaces:** none (documentation + operational).

- [ ] **Step 1: Update `README.md`**

In the "Configure your search" section, replace the bullet describing `maxPriceEur / minAreaSqm / maxAreaSqm` and `kleinanzeigenQueries` with a description of the `profiles` array: each profile has `filters` (`maxPriceEur` / `minAreaSqm` / `maxAreaSqm`), `is24RealEstateTypes`, `kleinanzeigenQueries`, and `enrichAmenities`. Note the current `room` profile (≤€600, ≥15 m²) and that a `salon` profile can be added as a second array entry. Add a line that `amenityKeywords` controls the window/transit/24-7 flags shown on Kleinanzeigen listings.

Update the architecture note: the pipeline now runs each profile across both sources, and Kleinanzeigen ads are enriched from their detail page (cached in `state/kleinanzeigen-cache.json`).

- [ ] **Step 2: Update `SETUP.md`**

Replace the "Tuning knobs" bullets that reference `maxPriceEur` / `maxAreaSqm` / `minAreaSqm` with the per-profile equivalents under `config.profiles[].filters`, and add `config.amenityKeywords` for the amenity flags. Add a note under "To do": after deploying this change, **clear `state/seen.json` once** so the first run reseeds silently (new room queries produce a different result set; reseeding avoids an alert blast).

- [ ] **Step 3: Reseed state**

```bash
rm -f state/seen.json
```

- [ ] **Step 4: Commit**

```bash
git add README.md SETUP.md state/seen.json
git commit -m "docs: document search profiles + amenity flags; reseed state"
```

(`git add state/seen.json` stages its deletion if it was tracked.)

---

## Self-review notes

- **Spec coverage:** price ≤600 + size ≥15 (Task 4 filter caps + tests); window/transit/24-7 soft flags (Tasks 1, 5); keep-unknowns (Task 4 filter test); Kleinanzeigen area enrichment so the size filter bites (Tasks 2, 5); detail-fetch politeness + cache (Tasks 3, 5); IS24 stays via `store`, no flags (Task 4); per-profile structure with salon deferred (Task 4 config); notifications show flags (Task 5); reseed + docs (Task 6). All covered.
- **Dedup key:** unchanged (`source:id`) per spec; `state.ts` is not modified. The future per-profile key is documented in the spec, not implemented here.
- **Type consistency:** `applyFilters(listings, profiles)`, `fetchListings(profile, cfg?)`, `matchAmenities(text, kw)`, `amenitySummary(tags)`, `extractDetailText`/`parseAreaFromText`, `loadCache`/`saveCache` are used with identical signatures across tasks.
