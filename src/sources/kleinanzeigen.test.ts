import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../config.js";
import { distanceKmFromLocation, parseListings, searchUrl } from "./kleinanzeigen.js";

/** Minimal list-view article markup matching the selectors parseListings reads. */
function article(id: string, title: string, location: string, tags: string[] = []): string {
  const tagHtml = tags.map((t) => `<span class="simpletag">${t}</span>`).join("");
  return `<article class="aditem" data-adid="${id}" data-href="/s-anzeige/${id}">
    <h2><a class="ellipsis">${title}</a></h2>
    <div class="aditem-main--middle--price-shipping--price">25 € VB</div>
    <div class="aditem-main--top--left">${location}</div>
    <p class="text-module-end">${tagHtml}</p>
  </article>`;
}

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

// CL-265: Kleinanzeigen pads a sparse radius search with farther "Umgebung" listings, labelled
// with the distance in the list view. We parse that distance to enforce the radius client-side.
test("distanceKmFromLocation parses the km Kleinanzeigen prints, incl. ca. and decimals", () => {
  assert.equal(distanceKmFromLocation("80469 Isarvorstadt (0.5 km)"), 0.5);
  assert.equal(distanceKmFromLocation("81925 Bogenhausen (4 km)"), 4);
  assert.equal(distanceKmFromLocation("83026 Rosenheim (ca. 50 km)"), 50);
  assert.equal(distanceKmFromLocation("82110 Germering (16 km)"), 16);
});

test("distanceKmFromLocation returns null when no distance is shown", () => {
  assert.equal(distanceKmFromLocation("80331 München"), null);
  assert.equal(distanceKmFromLocation(""), null);
});

test("parseListings drops listings beyond the radius and keeps the rest (CL-265)", () => {
  const html = `<html><body>
    ${article("1", "Behandlungsraum Maxvorstadt", "80335 Maxvorstadt (2 km)")}
    ${article("2", "IKEA MALM Schminktisch mit Stauraum Kosmetiktisch", "83026 Rosenheim (ca. 50 km)")}
  </body></html>`;
  const listings = parseListings(html, "room", config.kleinanzeigenRadiusKm);
  assert.deepEqual(
    listings.map((l) => l.id),
    ["1"],
    "the 50 km Rosenheim listing must be dropped, the 2 km one kept",
  );
});

test("parseListings keeps a listing with no distance label", () => {
  const html = `<html><body>${article("9", "Friseur Raum", "80331 München")}</body></html>`;
  const listings = parseListings(html, "room", config.kleinanzeigenRadiusKm);
  assert.equal(listings.length, 1);
});

test("parseListings keeps a listing exactly at the radius boundary", () => {
  const html = `<html><body>${article("10", "Raum am Rand", "85540 Haar (10 km)")}</body></html>`;
  const listings = parseListings(html, "room", 10);
  assert.equal(listings.length, 1, "a listing at exactly the radius must be kept");
});

// CL-269: someone seeking a room ("Gesuch") is not a room on offer. Kleinanzeigen tags these
// in the list view with a .simpletag reading "Gesuch"; we must drop them before they alert.
test("parseListings drops Gesuche (wanted ads) and keeps offers (CL-269)", () => {
  const html = `<html><body>
    ${article("1", "Suche Friseurraum zur Miete", "80331 München", ["Gesuch"])}
    ${article("2", "Friseurraum zu vermieten", "80331 München")}
  </body></html>`;
  const listings = parseListings(html, "room", config.kleinanzeigenRadiusKm);
  assert.deepEqual(listings.map((l) => l.id), ["2"], "the Gesuch must be dropped, the offer kept");
});

test("parseListings keeps offers carrying unrelated simpletags (CL-269)", () => {
  const html = `<html><body>${article("3", "Friseurraum", "80331 München", ["Versand möglich", "Provisionsfrei"])}</body></html>`;
  const listings = parseListings(html, "room", config.kleinanzeigenRadiusKm);
  assert.deepEqual(listings.map((l) => l.id), ["3"], "non-Gesuch tags must not drop an offer");
});
