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
