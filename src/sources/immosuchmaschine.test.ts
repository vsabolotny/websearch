import { test } from "node:test";
import assert from "node:assert/strict";
import { parseListings } from "./immosuchmaschine.js";

const CARD = (id: string, body: string) =>
  `<li class="block_item clearfix col-xs-12" id="item_${id}">${body}</li>`;

const PAGE = `<ul>${[
  CARD(
    "57751351",
    `<a href="https://www.immosuchmaschine.de/expose/57751351" class="objectLink"><span class="data_created">gestern</span></a>
     <h3>Abgeschlossener Büroraum im Showroom</h3>
     <dl><dt>Miete / Monat</dt><dd>€ 450,-</dd></dl>
     <dl><dt>Nutzfläche</dt><dd>22 m²</dd></dl>
     <dl><dt>Zimmer</dt><dd>—</dd></dl>`,
  ),
  CARD(
    "99",
    `<a href="https://www.immosuchmaschine.de/expose/99" class="objectLink">x</a>
     <h3>Raum ohne Angaben</h3>
     <dl><dt>Miete / Monat</dt><dd>—</dd></dl>
     <dl><dt>Nutzfläche</dt><dd>—</dd></dl>`,
  ),
].join("")}</ul>`;

test("parseListings extracts id, title, price, area and url from a card", () => {
  const [first] = parseListings(PAGE, "room");
  assert.deepEqual(first, {
    source: "immosuchmaschine",
    profile: "room",
    id: "57751351",
    title: "Abgeschlossener Büroraum im Showroom",
    price: "€ 450,-",
    priceEur: 450,
    areaSqm: 22,
    address: null,
    url: "https://www.immosuchmaschine.de/expose/57751351",
  });
});

test("parseListings treats the '—' placeholder as missing price/area (not dropped)", () => {
  const listing = parseListings(PAGE, "room").find((l) => l.id === "99");
  assert.ok(listing, "listing with no facts is still returned");
  assert.equal(listing.price, null);
  assert.equal(listing.priceEur, null);
  assert.equal(listing.areaSqm, null);
});

test("parseListings derives the expose url from the id when no link is present", () => {
  const html = CARD("4242", `<h3>Ohne Link</h3><dl><dt>Miete / Monat</dt><dd>€ 300,-</dd></dl>`);
  const [listing] = parseListings(html, "room");
  assert.equal(listing?.url, "https://www.immosuchmaschine.de/expose/4242");
});

test("parseListings returns [] when there are no cards", () => {
  assert.deepEqual(parseListings("<html><body>kein Treffer</body></html>", "room"), []);
});
