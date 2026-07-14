# Cross-portal keywords + exclude filter — design

**Date:** 2026-07-14

## Problem

Search keywords live on each profile as `kleinanzeigenQueries` and only drive
Kleinanzeigen's native search. IS24, immosuchmaschine and MatchOffice pull
everything in a category/type + geo radius, then only the price/area caps trim
the result — keywords have no effect there. TOP HAIR uses its own regex-based
salon-space detection.

The user wants:

- **Raum**: add keyword `gewerbefläche`
- **Lager**: add keyword `raumfläche`
- **Salon**: add keyword `salonfläche`, plus a "keine Stuhlmiete" exclusion
- Keywords **and** filters should apply to **all portals**, not just Kleinanzeigen.

## Decisions (confirmed with user)

1. For portals without native keyword search (IS24, immosuchmaschine,
   MatchOffice), keywords act as a **post-fetch include filter**: a listing is
   dropped unless its text contains one of the profile's keywords. The user
   accepted the resulting heavy reduction in structured-portal volume.
2. Salon "keine Stuhlmiete" = **complete exclusion**: any ad mentioning
   `Stuhlmiete`/`Stuhlplatz` is dropped for the Salon profile, across all
   portals. This reverses TOP HAIR's current behavior where chair rentals are a
   *positive* signal.
3. `salonfläche` **activates Kleinanzeigen** for the Salon profile (it was
   TOP-HAIR-only). Kleinanzeigen runs for any profile with non-empty keywords.

## Config model (`config.ts`)

Rename `kleinanzeigenQueries` → **`keywords`** (no longer Kleinanzeigen-only) and
add an optional **`excludeKeywords?: string[]`**:

```ts
/** Search terms: native Kleinanzeigen search + cross-portal include filter. */
keywords: string[];
/** Drop any listing whose text contains one of these (all portals). */
excludeKeywords?: string[];
```

Profile values after the change:

| Profile | `keywords` | `excludeKeywords` |
|---|---|---|
| Raum (`room`) | existing + `"gewerbefläche"` | — |
| Lager (`storage`) | existing + `"raumfläche"` | — |
| Salon (`salon`) | `["salonfläche"]` (was `[]`) | `["stuhlmiet", "stuhlplatz"]` |

## How keywords reach each portal

| Portal | Include (keywords) | Exclude (excludeKeywords) |
|---|---|---|
| Kleinanzeigen | native URL search per keyword (unchanged) | central, on title |
| IS24 / immosuchmaschine / MatchOffice | **post-filter**: keep only if `title + " " + address` contains a keyword | central, on title + address |
| TOP HAIR | keeps own salon-space detection (a raw keyword requirement would gut it — its ads rarely contain the exact word) | **in-adapter**, on ad **body** (only place with full text) |

### New module `src/keywords.ts`

```ts
/** Case-insensitive substring match of any term in text. */
export function matchesAny(text: string, terms: string[]): boolean;

/**
 * Apply per-profile keyword include/exclude filtering.
 * - Exclude: drop listing if excludeKeywords match `title + address`
 *   (all sources). TOP HAIR additionally excludes on body in its adapter.
 * - Include: for structured sources (immoscout24, immosuchmaschine,
 *   matchoffice) with non-empty keywords, keep only listings whose
 *   `title + address` matches a keyword. Kleinanzeigen (native search
 *   already applied keywords) and TOP HAIR (own detection) are exempt.
 * Empty keyword/exclude lists = no-op.
 */
export function applyKeywordFilters(listings: Listing[], profiles: SearchProfile[]): Listing[];
```

Called in `index.ts` right after `gather()`, **before** `enrichKleinanzeigen()`,
so we don't spend detail-page fetches on ads that will be dropped:

```ts
let listings = await gather();
listings = applyKeywordFilters(listings, config.profiles);
await enrichKleinanzeigen(listings);
const matches = applyFilters(listings, config.profiles);
```

### TOP HAIR exclude

`ParseOptions` gains `excludeKeywords?: string[]`. In `parseListings`, after the
existing `isSalonSpaceAd` check, drop the ad if its lower-cased body matches any
excludeKeyword. `fetchListings` passes `profile.excludeKeywords` through. This is
the only adapter that keeps the full ad body, so it is the only place that can
honor "keine Stuhlmiete" reliably (the term sits in the body, not the title).

## Matching semantics

Case-insensitive **substring** match; each keyword entry is matched **as-is**.

**Caveat (accepted by user):** existing multi-word phrases (e.g.
`"friseur raum mieten"`) will almost never match the short titles that IS24 /
immosuchmaschine expose. So on structured portals the *single* words
(`gewerbefläche`, `raumfläche`, `salonfläche`) carry the real filtering, while
phrases stay effective on Kleinanzeigen's native search. This is predictable and
matches the heavy reduction the user chose.

## Testing (TDD)

- **`keywords.test.ts`** (new)
  - `matchesAny` — case-insensitive, substring, empty list = false.
  - `applyKeywordFilters` — structured source dropped when title/address lacks a
    keyword, kept when present; Kleinanzeigen and TOP HAIR bypass the include
    filter; excludeKeywords drop across sources; empty lists = no-op.
- **`tophair.test.ts`** — new case: an ad whose body says "Stuhlmiete frei" is
  dropped when `excludeKeywords` includes `"stuhlmiet"`; a "Salonfläche zu
  vermieten" ad is kept.
- **`config.test.ts` / `filter.test.ts`** — update for the `kleinanzeigenQueries`
  → `keywords` rename; add assertions that the three profiles carry the new
  keywords and that Salon excludes Stuhlmiete.

## Out of scope

- No richer text extraction for IS24/immosuchmaschine (title + address only).
- No change to price/area caps — they already apply to every portal via
  `applyFilters`.
