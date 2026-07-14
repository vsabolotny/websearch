import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesAny, applyKeywordFilters } from "./keywords.js";
import type { Listing, Source } from "./types.js";
import type { SearchProfile } from "./config.js";

const room: SearchProfile = {
  key: "room",
  label: "Raum",
  filters: { maxPriceEur: 600, minAreaSqm: 15, maxAreaSqm: null },
  is24RealEstateTypes: ["store"],
  keywords: ["gewerbefläche", "behandlungsraum"],
  enrichAmenities: true,
};

const salon: SearchProfile = {
  key: "salon",
  label: "Salon",
  filters: { maxPriceEur: null, minAreaSqm: null, maxAreaSqm: null },
  is24RealEstateTypes: [],
  keywords: ["salonfläche"],
  excludeKeywords: ["stuhlmiet", "stuhlplatz"],
  tophairEnabled: true,
  enrichAmenities: false,
};

function listing(over: Partial<Listing> & { source: Source }): Listing {
  return {
    profile: "room", id: "x", title: "t", price: null, priceEur: null,
    areaSqm: null, address: null, url: "u", ...over,
  };
}

const keep = (l: Listing, profiles = [room, salon]) =>
  applyKeywordFilters([l], profiles).length === 1;

test("matchesAny is a case-insensitive substring match; empty terms never match", () => {
  assert.ok(matchesAny("Schöne Gewerbefläche in München", ["gewerbefläche"]));
  assert.ok(matchesAny("STUHLMIETE frei", ["stuhlmiet"]));
  assert.ok(!matchesAny("Ladenlokal zentral", ["gewerbefläche"]));
  assert.ok(!matchesAny("anything", []));
});

test("structured sources are kept only when a keyword matches title/address", () => {
  assert.ok(keep(listing({ source: "immoscout24", title: "Gewerbefläche 30 m²" })), "keyword in title kept");
  assert.ok(
    keep(listing({ source: "immosuchmaschine", title: "Fläche", address: "Behandlungsraum-Str. 1" })),
    "keyword in address kept",
  );
  assert.ok(!keep(listing({ source: "immoscout24", title: "Ladenlokal 30 m²" })), "no keyword dropped");
});

test("Kleinanzeigen and TOP HAIR bypass the include filter (native search / own detection)", () => {
  assert.ok(keep(listing({ source: "kleinanzeigen", title: "Ladenlokal ohne Keyword" })));
  assert.ok(keep(listing({ profile: "salon", source: "tophair", title: "Raum zu vermieten" })));
});

test("excludeKeywords drop a listing on any source", () => {
  assert.ok(!keep(listing({ profile: "salon", source: "tophair", title: "Stuhlmiete frei" })), "tophair excluded");
  assert.ok(
    !keep(listing({ profile: "salon", source: "kleinanzeigen", title: "Stuhlplatz frei ab sofort" })),
    "kleinanzeigen excluded",
  );
  assert.ok(keep(listing({ profile: "salon", source: "kleinanzeigen", title: "Salonfläche zu vermieten" })), "room kept");
});

test("a profile without keywords/excludeKeywords is a no-op for its listings", () => {
  const bare: SearchProfile = { ...room, key: "bare", keywords: [], excludeKeywords: undefined };
  assert.ok(keep(listing({ profile: "bare", source: "immoscout24", title: "irgendwas" }), [bare]));
});

test("a listing whose profile is unknown passes through untouched", () => {
  assert.ok(keep(listing({ profile: "ghost", source: "immoscout24", title: "no keyword" })));
});
