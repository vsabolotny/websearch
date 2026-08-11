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
  keywords: [],
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
test("drops listings with unknown price and unknown area when the profile has a price cap", () => {
  assert.equal(applyFilters([listing({ priceEur: null })], [room]).length, 0);
});
test("keeps unknown-price listings whose area is within the profile's range", () => {
  assert.equal(applyFilters([listing({ priceEur: null, areaSqm: 30 })], [room]).length, 1);
});
test("drops unknown-price listings whose area is under the profile's minimum", () => {
  assert.equal(applyFilters([listing({ priceEur: null, areaSqm: 8 })], [room]).length, 0);
});
test("drops unknown-price listings whose area exceeds the room-sized ceiling", () => {
  // room has no maxAreaSqm, so without the ceiling a 6810 m² hall would qualify.
  assert.equal(applyFilters([listing({ priceEur: null, areaSqm: 6810 })], [room]).length, 0);
});
test("honors an explicit maxAreaSqm over the ceiling for unknown-price listings", () => {
  const capped: SearchProfile = { ...room, key: "storage", filters: { maxPriceEur: 600, minAreaSqm: 15, maxAreaSqm: 40 } };
  assert.equal(applyFilters([listing({ profile: "storage", priceEur: null, areaSqm: 60 })], [capped]).length, 0);
  assert.equal(applyFilters([listing({ profile: "storage", priceEur: null, areaSqm: 30 })], [capped]).length, 1);
});
test("keeps listings with unknown price when the profile has no price cap", () => {
  const uncapped: SearchProfile = { ...room, key: "salon", filters: { maxPriceEur: null, minAreaSqm: null, maxAreaSqm: null } };
  assert.equal(applyFilters([listing({ profile: "salon", priceEur: null })], [uncapped]).length, 1);
});
test("drops listings under the area minimum", () => {
  assert.equal(applyFilters([listing({ priceEur: 500, areaSqm: 10 })], [room]).length, 0);
});
test("keeps listings at or over the area minimum", () => {
  assert.equal(applyFilters([listing({ priceEur: 500, areaSqm: 15 })], [room]).length, 1);
});
test("keeps listings with unknown area", () => {
  assert.equal(applyFilters([listing({ priceEur: 500, areaSqm: null })], [room]).length, 1);
});
test("drops listings whose profile has no caps defined", () => {
  assert.equal(applyFilters([listing({ profile: "ghost" })], [room]).length, 0);
});
