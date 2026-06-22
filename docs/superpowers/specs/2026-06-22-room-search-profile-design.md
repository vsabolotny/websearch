# Room search profile — design

Date: 2026-06-22
Status: approved (design)

## Goal

Add a dedicated **room** search to the salon-room monitor: a small commercial unit
(Ladenfläche / Gewerberaum) to run a hair-extension business. The room search runs
across **all sources** (ImmobilienScout24 + Kleinanzeigen) with its own filters and
queries, independent of the future **salon** search (a larger/whole space), which is a
separate task.

"Room" here means a small commercial space the user would rent for their own business —
**not** a chair/Stuhlmiete inside someone else's salon.

## Room criteria

| Criterion | How it is applied |
| --- | --- |
| Max rent €600 | Hard filter (`maxPriceEur: 600`). Ads with no price still pass (keep unknowns). |
| Min size 15 m² | Hard filter (`minAreaSqm: 15`). Ads with no stated size still pass (keep unknowns). |
| Window present | Soft flag — surfaced, never filters anything out. |
| Good public-transport connection | Soft flag. |
| Always accessible (nights/weekends, 24/7) | Soft flag. |

Decisions made during brainstorming:
- Free-text criteria (window / transit / 24-7) are **soft flags, never drop**.
- Price and size **keep unknowns** (ads that hide price or omit size still show).
- This task implements the **room** profile only; the **salon** profile is a later task.
- IS24 stays in the room search using the commercial `store` type; room vs salon is
  distinguished by the **filter caps**, not by source.

## Architecture: search profiles

The current config has IS24 params, Kleinanzeigen params, and one **shared** set of
filter caps applied to both sources. We restructure so a **search profile** owns its
filters and queries and runs across both sources. This task fills in the `room` profile;
`salon` slots in later.

### `config.ts`

Shared region settings stay top-level (`regionLabel`, `is24Lat`, `is24Lon`,
`is24RadiusKm`, `kleinanzeigenLocationId`, `kleinanzeigenRadiusKm`). Amenity keywords are
shared. Searches become profiles:

```ts
interface FilterCaps {
  maxPriceEur: number | null;
  minAreaSqm: number | null;
  maxAreaSqm: number | null;
}

interface AmenityKeywords {
  window: string[];
  transit: string[];
  alwaysAccessible: string[];
}

interface SearchProfile {
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
```

Room profile defaults:

```ts
profiles: {
  room: {
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
}
```

Amenity keyword defaults (German, editable):
- `window`: `fenster`, `tageslicht`, `lichtdurchflutet`, `natürliches licht`
- `transit`: `u-bahn`, `s-bahn`, `öpnv`, `öffentliche`, `bus`, `tram`, `straßenbahn`,
  `haltestelle`, `anbindung`, `verkehrsanbindung`, `bahnhof`, `zentral`
- `alwaysAccessible`: `24 stunden`, `24/7`, `24h`, `rund um die uhr`, `jederzeit zugang`,
  `jederzeit zugäng`, `eigener schlüssel`, `eigenen schlüssel`, `schlüssel`, `wochenende`,
  `nachts`

### `types.ts`

```ts
interface AmenityTags {
  window?: boolean;
  transit?: boolean;
  alwaysAccessible?: boolean;
}
```

`Listing` gains:
- `profile: string` — which profile matched (e.g. `"room"`), for labeling.
- `tags?: AmenityTags` — amenity flags (present only for enriched Kleinanzeigen ads).

### `filter.ts`

`applyFilters` takes each listing's profile caps and applies the price/size bounds. The
"unknown values pass through" behavior is kept: a null `priceEur` or null `areaSqm` does
not exclude a listing.

### `index.ts` (orchestrator)

For each profile, fetch from both sources, tag each listing with the profile, then apply
that profile's filters. Listings carry `profile` so alerts can show the label. With only
the `room` profile defined now, the dedup key stays `source:id` (unchanged) — see the
state note below.

## Source changes

### `sources/kleinanzeigen.ts` — enrichment

Today the adapter reads only the results list (title, price, location); `areaSqm` is
always `null` and there is no description. Add an **enrichment** step:

1. Parse the results list as today.
2. For each ad, fetch its detail page **once**, then:
   - parse the m² out of the detail text → set `areaSqm` (makes the ≥15 m² filter work).
   - keyword-match the detail text against `amenityKeywords` → set `tags`.
3. Be polite: a ~600 ms delay between detail fetches and a safety cap of ~40 ads enriched
   per run (uncached ads beyond the cap keep `areaSqm: null` / no tags, so they still pass
   the keep-unknowns filter). Both values are constants in the adapter, easy to tune.

To avoid re-fetching the same ad every 20 minutes (and risking blocks), keep a small
self-contained cache at `state/kleinanzeigen-cache.json`, keyed by ad id, storing
`{ areaSqm, tags }`. The cache is owned by the Kleinanzeigen module so sources stay
decoupled from run state.

### `sources/immoscout24.ts`

No structural change. The room profile passes `is24RealEstateTypes: ["store"]`. IS24
already reports area, so the ≥15 m² filter works. IS24 listings get **no amenity flags**
(the mobile list API has no full description; we do not fetch IS24 detail pages).

## Notifications

`notify/telegram.ts` and `notify/email.ts` render amenity flags when present, e.g.
`🪟 Fenster · 🚇 ÖPNV · 🔑 24/7`. Listings without tags (all IS24, and Kleinanzeigen ads
whose text matched nothing) render as today.

## State / reseed

The room queries are new, so existing `state/seen.json` entries do not correspond to the
new result set. To avoid an alert blast, the change **reseeds** on first run after deploy
(same mechanism as the original first-run seeding: record current matches silently, then
alert only on genuinely new ones). Operationally: clear/reseed `seen.json` once on deploy.

**Known future step (salon profile):** when the salon profile is added, the dedup key must
include the profile (`profile:source:id`) so the same ad found by both profiles is tracked
independently; that change requires a one-time reseed.

## Docs

Update `README.md` and `SETUP.md` "Tuning knobs" sections for the per-profile filters,
the room queries, and the amenity keywords.

## Out of scope

- The salon profile (separate task).
- IS24 amenity flags / detail fetching.
- Changing IS24 real-estate types beyond `store` for the room.
- Per-profile dedup keying (deferred until the salon profile exists).
