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
test("drops listings with unknown price when the profile has a price cap (CL-264)", () => {
  assert.equal(applyFilters([listing({ priceEur: null })], [room]).length, 0);
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
