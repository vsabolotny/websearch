import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "./config.js";
import { applyFilters } from "./filter.js";
import { searchUrl } from "./sources/kleinanzeigen.js";
import type { Listing } from "./types.js";

const storage = config.profiles.find((p) => p.key === "storage");

// CL-270: extend the monitor to also search for storage rooms ("Lagerraum") usable as salon
// space, under the same criteria the user always uses (≤600 € warm, 15–40 m², daylight/transit/24-7).
test("a dedicated storage profile exists, labelled 'Lager'", () => {
  assert.ok(storage, "expected a profile with key 'storage'");
  assert.equal(storage!.label, "Lager");
});

test("storage profile honors the stated search criteria (≤600 €, 15–40 m²)", () => {
  assert.deepEqual(storage!.filters, { maxPriceEur: 600, minAreaSqm: 15, maxAreaSqm: 40 });
  assert.equal(storage!.enrichAmenities, true, "amenity enrichment surfaces daylight/transit/24-7");
});

test("storage profile searches Kleinanzeigen for Lagerraum and IS24 'industry' halls", () => {
  assert.ok(
    storage!.kleinanzeigenQueries.some((q) => q.includes("lagerraum")),
    "expected at least one 'lagerraum' Kleinanzeigen query",
  );
  assert.deepEqual(storage!.is24RealEstateTypes, ["industry"]);
});

test("Lagerraum Kleinanzeigen queries stay scoped to Munich + 10 km", () => {
  for (const q of storage!.kleinanzeigenQueries) {
    assert.ok(searchUrl(q, config).endsWith("k0l6411r10"), `query "${q}" not Munich-scoped`);
  }
});

function listing(over: Partial<Listing>): Listing {
  return {
    source: "kleinanzeigen",
    profile: "storage",
    id: "x",
    title: "Lagerraum",
    price: null,
    priceEur: 400,
    areaSqm: 30,
    address: null,
    url: "https://example.com",
    ...over,
  };
}

test("storage filter adheres to the 15–40 m² / 600 € criteria", () => {
  const kept = (l: Listing) => applyFilters([l], config.profiles).length === 1;

  assert.ok(kept(listing({ areaSqm: 30, priceEur: 500 })), "a 30 m² / 500 € storage room is kept");
  assert.ok(!kept(listing({ areaSqm: 45 })), "a 45 m² room exceeds the 40 m² cap");
  assert.ok(!kept(listing({ areaSqm: 10 })), "a 10 m² room is below the 15 m² floor");
  assert.ok(!kept(listing({ priceEur: 700 })), "a 700 € room exceeds the 600 € cap");
  assert.ok(!kept(listing({ priceEur: null })), "an unpriced room can't be confirmed within budget");
  assert.ok(kept(listing({ areaSqm: null })), "unknown area still passes (filled by enrichment)");
});
