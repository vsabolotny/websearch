import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../config.js";
import { searchUrl } from "./kleinanzeigen.js";

// CL-259: the search range must be Munich center + a 10 km radius. The Kleinanzeigen
// radius had drifted to 20 km, widening the range well past Munich.
test("searchUrl scopes Kleinanzeigen to Munich (l6411) with a 10 km radius", () => {
  const url = searchUrl("friseur raum mieten", config);
  assert.ok(url.endsWith("k0l6411r10"), `expected Munich + 10 km, got ${url}`);
});

test("IS24 and Kleinanzeigen share the same 10 km search radius", () => {
  assert.equal(config.is24RadiusKm, 10);
  assert.equal(config.kleinanzeigenRadiusKm, 10);
  assert.equal(config.is24RadiusKm, config.kleinanzeigenRadiusKm);
});
