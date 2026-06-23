# CL-256 — Extend sources

## Goal

Widen salon-space coverage beyond the current two sources (ImmobilienScout24 mobile API + Kleinanzeigen HTML) by adding two new listing portals, so the monitor surfaces salon premises that don't appear on IS24/Kleinanzeigen.

## Feasibility findings (why these two, not the four on the ticket)

CL-256 lists ~30 candidate sources. Live probing (2026-06-23) of the four picked in brainstorming:

| Portal | Result | Verdict |
| --- | --- | --- |
| Immonet | 301 → Immowelt "sunset" redirect — site no longer exists | Out (it *is* Immowelt) |
| Immowelt | 403 Akamai bot-block on site + `serp-bff` API; residential API 401 | Out (needs a headless browser — separate ticket) |
| MatchOffice | 200; clean JSON-LD `ItemList` of listings | **In** |
| CompanySpace | TLS/connection failure under curl *and* Node fetch | Out (unreachable) |

Since two picks were impossible, brainstorming re-scoped to **one reachable aggregator + MatchOffice**. The aggregator restores the salon relevance MatchOffice lacks.

## Sources added

### 1. immosuchmaschine.de (metasearch aggregator — salon-relevant)

A German real-estate metasearch that indexes many portals (ohne-makler, etc.). Server-rendered HTML, parseable with cheerio (already a dependency).

- **Search URL:** `https://www.immosuchmaschine.de/b/<citySlug>/gewerbeimmobilien-mieten` (München → 3,272 results).
- **Card:** `li.block_item`; detail link `a.objectLink` → `https://www.immosuchmaschine.de/expose/<id>` (stable numeric id in the URL).
- **Fields in markup:** title, "Miete / Monat" (price), "Nutzfläche" (area in m²), origin portal, age.

### 2. matchoffice.de (office portal)

Office / coworking / business-center inventory. Listings are exposed as JSON-LD.

- **Search URL:** `https://www.matchoffice.de/mieten/<category>/<citySlug>` (e.g. `buro/muenchen` → 105 results).
- **Parse:** the second `<script type="application/ld+json">` block (`WebPage.mainEntity.itemListElement`), items are `@type:Product` with `name`, `url`, `category`, `description`.
- **Id:** trailing number in the detail URL (`…/zeppelinstrasse-52248` → `52248`). Items duplicate → dedup by id.
- **Known limitation:** Products carry **no price and no area** (offices are "auf Anfrage"). Per the repo's existing filter philosophy ("unknown price/area passes"), every MatchOffice listing passes the caps — so this source contributes unfiltered office listings. It is office inventory, not Ladenlokal, so salon relevance is low. See Open Question 2.

## Technical approach

Follows the existing adapter contract exactly — no architectural change.

- **`src/types.ts`** — extend `Source` union: `"immoscout24" | "kleinanzeigen" | "immosuchmaschine" | "matchoffice"`.
- **`src/sources/immosuchmaschine.ts`** — `fetchListings(profile, cfg)`; exported pure `parseListings(html, profileKey)` for tests. Fail-soft (try/catch → warn + skip), polite delay between requests, `MAX_PAGES` cap, dedup by id. Standalone `import.meta` runner like the others.
- **`src/sources/matchoffice.ts`** — `fetchListings(profile, cfg)`; exported pure `parseListings(html, profileKey)` parsing the JSON-LD. Same fail-soft + standalone runner.
- **`src/index.ts`** — add both to the `SOURCES` array.
- **`src/config.ts`:**
  - Shared region: add `citySlug: string` (`"muenchen"`) used by both new sources' URLs.
  - Per-profile opt-in arrays (optional; empty/undefined = source skipped for that profile, matching the existing `is24RealEstateTypes` / `kleinanzeigenQueries` pattern): `immosuchmaschineCategories?: string[]`, `matchofficeCategories?: string[]`.
  - **No new profile.** The new sources are wired into the existing **`room`** profile and honor its existing criteria (`maxPriceEur: 600`, `minAreaSqm: 15`). A ≤€600 cap naturally keeps only small/cheap commercial rooms (what the room search wants) and drops full-premises commercial listings.

`room` profile additions:
- `immosuchmaschineCategories: ["gewerbeimmobilien-mieten"]` — small Gewerberäume ≤€600 survive the cap; bigger premises are filtered out.
- `matchofficeCategories: []` — **dormant by default.** MatchOffice carries no price/area, so it can't honor the room caps and would flood the report with unfiltered office listings. Wired but off until explicitly enabled. (Open Question 2.)

## Out of scope

- Immonet, Immowelt, CompanySpace (see findings table). Immowelt could be a later headless-browser ticket.
- Detail-page enrichment (area/amenities) for the new sources — list-level data only.
- Pagination beyond `MAX_PAGES`.
- Changing the existing `room` profile or the IS24/Kleinanzeigen adapters.

## Open questions

1. ~~Salon profile caps~~ — **resolved:** no new profile; the new sources use the existing `room` criteria (`maxPriceEur: 600`, `minAreaSqm: 15`).
2. **MatchOffice** — proposed **dormant** (`matchofficeCategories: []`) because it has no price/area and so can't honor the room caps. Confirm dormant, or enable it anyway (accepting office noise)?
3. ~~immosuchmaschine volume~~ — **resolved by probing:** URL pagination (`?seite=`/`?page=`) is non-functional (AJAX-only), so the adapter fetches **page 1 sorted newest-first** (`?orderby=obj.created_date&sortmode=1`). That is the correct behavior for a 20-minute new-listings monitor: each run sees the most recent listings, dedup + cadence cover the rest.

## Test plan

Unit tests over captured fixtures (no network), mirroring `kleinanzeigenDetail.test.ts`:

- **immosuchmaschine** `parseListings`: extracts title/price/area/id/url from a real card fixture; keeps a listing with missing price/area (null, not dropped); returns `[]` for markup with no cards.
- **matchoffice** `parseListings`: extracts Product items from a JSON-LD fixture; id derived from URL; dedups repeated items; price/area null; returns `[]` for HTML lacking the JSON-LD block / malformed JSON.

Then full suite (`npm test`) + `npm run typecheck` must pass. Manual local check via `tsx src/sources/immosuchmaschine.ts` and `tsx src/sources/matchoffice.ts` (added as `npm run` scripts) to confirm live fetch returns listings (Gate 2).
