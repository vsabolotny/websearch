import { test } from "node:test";
import assert from "node:assert/strict";
import { parseListings } from "./immosuchmaschine.js";
import type { AmenityKeywords } from "../types.js";

const KEYWORDS: AmenityKeywords = {
  window: ["fenster"],
  transit: ["u-bahn", "öpnv"],
  alwaysAccessible: ["24/7"],
};

const CARD = (id: string, body: string) =>
  `<li class="block_item clearfix col-xs-12" id="item_${id}">${body}</li>`;

// Cards now deep-link straight to the partner site via a.objectLink (no on-site /expose page),
// and carry the location in div.data_zipcity as "<street>, <plz city> • <type>".
const PAGE = `<ul>${[
  CARD(
    "57751351",
    `<a href="https://wohnglueck.de/property/1397786" class="objectLink"><span class="data_created">gestern</span></a>
     <div class="data_zipcity">Landsberger Straße, 80687 München • Büro zu mieten</div>
     <h3>Abgeschlossener Büroraum im Showroom</h3>
     <dl><dt>Miete / Monat</dt><dd>€ 450,-</dd></dl>
     <dl><dt>Nutzfläche</dt><dd>22 m²</dd></dl>
     <dl><dt>Zimmer</dt><dd>—</dd></dl>`,
  ),
  CARD(
    "99",
    `<a href="https://wohnglueck.de/property/99" class="objectLink">x</a>
     <h3>Raum ohne Angaben</h3>
     <dl><dt>Miete / Monat</dt><dd>—</dd></dl>
     <dl><dt>Nutzfläche</dt><dd>—</dd></dl>`,
  ),
].join("")}</ul>`;

test("parseListings extracts id, title, price, area, address and the partner url from a card", () => {
  const [first] = parseListings(PAGE, "room");
  assert.deepEqual(first, {
    source: "immosuchmaschine",
    profile: "room",
    id: "57751351",
    title: "Abgeschlossener Büroraum im Showroom",
    price: "€ 450,-",
    priceEur: 450,
    areaSqm: 22,
    address: "Landsberger Straße, 80687 München",
    url: "https://wohnglueck.de/property/1397786",
  });
});

test("parseListings uses the partner objectLink url, never an on-site /expose path", () => {
  const [first] = parseListings(PAGE, "room");
  assert.equal(first?.url, "https://wohnglueck.de/property/1397786");
  assert.ok(!first?.url.includes("/expose/"), "must not emit the removed /expose route (404)");
});

test("parseListings treats the '—' placeholder as missing price/area (not dropped)", () => {
  const listing = parseListings(PAGE, "room").find((l) => l.id === "99");
  assert.ok(listing, "listing with no facts is still returned");
  assert.equal(listing.price, null);
  assert.equal(listing.priceEur, null);
  assert.equal(listing.areaSqm, null);
});

test("parseListings leaves address null when no data_zipcity is present", () => {
  const listing = parseListings(PAGE, "room").find((l) => l.id === "99");
  assert.equal(listing?.address, null);
});

test("parseListings skips a card with no link rather than emit a dead url", () => {
  const html = CARD("4242", `<h3>Ohne Link</h3><dl><dt>Miete / Monat</dt><dd>€ 300,-</dd></dl>`);
  assert.deepEqual(parseListings(html, "room"), []);
});

test("parseListings sets amenity tags from the card text when keywords are supplied", () => {
  const html = CARD(
    "7",
    `<a href="https://wohnglueck.de/property/7" class="objectLink">x</a>
     <h3>Raum mit U-Bahn</h3>
     <div class="block_desc">Direkt an der U-Bahn, mit Fenster.</div>`,
  );
  const [listing] = parseListings(html, "room", KEYWORDS);
  assert.equal(listing?.tags?.transit, true);
  assert.equal(listing?.tags?.window, true);
});

test("parseListings omits tags when no keywords are supplied", () => {
  const [first] = parseListings(PAGE, "room");
  assert.equal(first?.tags, undefined);
});

test("parseListings returns [] when there are no cards", () => {
  assert.deepEqual(parseListings("<html><body>kein Treffer</body></html>", "room"), []);
});
