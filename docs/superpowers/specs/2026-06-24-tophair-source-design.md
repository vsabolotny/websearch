# CL-261 — Add TOP HAIR Kleinanzeigen source

## Goal

Add `https://www.tophair.de/kleinanzeigen/` as a monitored source. It is the classifieds
board of TOP HAIR (a hairdresser trade magazine) and carries salon-business opportunities —
salons to rent/buy/take over, chair rental (Stuhlmiete), successor-tenant (Nachmieter) ads —
that don't appear on IS24/Kleinanzeigen/immosuchmaschine. The monitor should surface **new
München salon-space ads** from this board.

## Decisions (locked with user)

- **Geographic scope: München only.** The board is nationwide (~124 ads today, only ~19 mention
  München). It has no structured location field, so scoping is by matching city text in the ad,
  matching how the rest of the monitor is München-scoped.
- **Ad types: salon-space only.** The board mixes salon-space ads with equipment-for-sale and job
  postings. Keep rent/lease/takeover/chair-rental; drop equipment and jobs via keyword heuristics
  (accepted as heuristic — a few may slip through or be missed).

## Source structure (probed live 2026-06-24)

- WordPress page, **server-rendered** (all ads in static HTML — no headless browser needed).
- Each ad = one `div.wp-block-stackable-column`. Inside: a heading
  (`<h3 class="stk-block-heading__text">` title + a slugified anchor `id`), optional image, and
  free-text description block(s). Sometimes an outbound "Siehe Anzeige Kleinanzeigen" link.
- **No structured fields.** Only ~32/124 ads carry a parseable € price, ~30 an area. Heading anchor
  ids are **not unique** (119 unique of 124 — title collisions), so they can't be the dedup key.

## Technical approach

Follows the existing adapter contract exactly (mirrors `immosuchmaschine.ts`) — no architectural
change beyond a second search profile.

- **`src/types.ts`** — extend `Source` union with `"tophair"`.

- **`src/sources/tophair.ts`** — new adapter:
  - `parseListings(html, profileKey, opts)` — pure, exported for tests. Iterates each
    `.wp-block-stackable-column`; per ad extracts:
    - **title** from `h3.stk-block-heading__text`; **slug** from the heading's `id` attr.
    - **price** = first `€`/`EUR` amount in the body text (display only); **areaSqm** = first
      `m²`/`qm` value. Both null if absent (informational; the salon profile has no caps).
    - **id** = first 12 hex of `sha1(normalized title + "\n" + body)` — stable across runs,
      unique per distinct ad, and identical reposts collapse correctly.
    - **url** = `https://www.tophair.de/kleinanzeigen/#<slug>` (page anchor — always reachable).
    - optional amenity **tags** via `matchAmenities(body, amenityKeywords)`, like immosuchmaschine.
    - **Keeps** an ad only if its text matches a region keyword **and** `isSalonSpaceAd(...)`.
  - `isSalonSpaceAd(title, body)` — validated heuristic, in order:
    1. equipment-dominated **title** (registrierkasse, bedienstuhl, schere, waschliege, …) with no
       premises noun → drop;
    2. **strong** salon-space signal (stuhlmiete, nachmieter, salonauflösung, co-working) → keep
       (wins over the job rule, so "Nachmieter gesucht" stays);
    3. **job** signal ("(m/w/d)", mitarbeiter, verstärkung, ausbildung, …) → drop;
    4. otherwise keep iff a **premises** noun (salon, laden, gewerbe, studio, fläche, …) co-occurs
       with a **transfer** verb (vermieten, übernahme, nachfolge, verkaufen, pacht, ablöse, …).
  - `fetchListings(profile, cfg)` — returns `[]` when `!profile.tophairEnabled`; else fetches the
    single board URL with `DE_HEADERS`, fail-soft (try/catch → warn + skip), and runs `parseListings`
    with `cfg.tophairRegionKeywords` + `cfg.amenityKeywords`. One page only (the whole board is one
    URL; no pagination).
  - Standalone `import.meta` runner + `npm run tophair` script, like the other adapters.

- **`src/index.ts`** — add `{ name: "TOP HAIR", fetch: fetchTophair }` to `SOURCES`.

- **`src/config.ts`:**
  - Shared region: `tophairRegionKeywords: string[]` = `["münchen", "muenchen"]` (substring match,
    case-insensitive; catches "Münchener", "München-Ottobrunn", "bei München").
  - Per-profile opt-in: `tophairEnabled?: boolean` (undefined/false = source skipped, matching the
    existing `immosuchmaschineCategories` / `matchofficeCategories` opt-in pattern).
  - **New `salon` profile** (label "Salon"): `filters` all `null` (report every match — salon
    businesses aren't priced like a €600/month room, so the room caps must not apply), empty arrays
    for every other source, `tophairEnabled: true`, `enrichAmenities: false`. The existing `room`
    profile is **left untouched** (no `tophairEnabled`, so tophair returns `[]` for it).

## Why a new profile, not folding into `room`

The `room` profile caps at `maxPriceEur: 600` / `minAreaSqm: 15`. A salon-for-sale or takeover ad
is a business opportunity (Abstand/Ablöse in the thousands), not a monthly room rent — applying the
€600 cap would wrongly drop exactly the priced salon ads the user wants to see. A dedicated `salon`
profile with no caps models this inventory correctly; the adapter's region + salon-space filtering
does the relevance work instead of price/area caps.

## Out of scope

- Nationwide ads (München-scoped per decision); equipment-for-sale and job postings.
- Detail-page enrichment (area/amenities beyond what the board text yields).
- Following the outbound kleinanzeigen.de detail links (we link to the on-page anchor).
- Touching the `room` profile or the IS24/Kleinanzeigen/immosuchmaschine/MatchOffice adapters.

## Test plan

Unit tests over a captured HTML fixture (no network), mirroring `immosuchmaschine.test.ts`:

- `parseListings` extracts title/price/area/id/url from a München salon-space card; id is the
  content hash; url is the `#slug` page anchor.
- **Keeps** a München salon-space ad (e.g. "Friseursalon in München … Übernahme").
- **Drops** an equipment ad ("Casio Registrierkasse …"), a job ad ("Friseur (m/w/d) gesucht"), and a
  non-München salon ad.
- **Keeps** the tricky "Nachmieter gesucht München …" (strong signal beats the job rule).
- Returns `[]` for markup with no ad columns.
- `fetchListings` returns `[]` when `tophairEnabled` is false (no network call).

Then full suite (`npm test`) + `npm run typecheck` must pass. Manual local check via
`npm run tophair` to confirm the live board returns the expected ~14 München salon-space listings
(Gate 2).
