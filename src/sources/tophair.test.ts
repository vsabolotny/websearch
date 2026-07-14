import { test } from "node:test";
import assert from "node:assert/strict";
import { parseListings, isSalonSpaceAd, fetchListings } from "./tophair.js";
import type { AmenityKeywords } from "../types.js";
import type { SearchProfile } from "../config.js";

const KEYWORDS: AmenityKeywords = {
  window: ["fenster"],
  transit: ["u-bahn", "öpnv"],
  alwaysAccessible: ["24/7"],
};

const MUC = { regionKeywords: ["münchen", "muenchen"] };

/** One ad as the live board renders it: a stackable column with a slug-anchored heading + text. */
const COL = (slug: string, title: string, body: string) =>
  `<div class="wp-block-stackable-feature-grid stk-block-columns">
     <div class="wp-block-stackable-column stk-block-column">
       <div class="wp-block-stackable-heading stk-block-heading" id="${slug}">
         <h3 class="stk-block-heading__text">${title}</h3>
       </div>
       <div class="wp-block-stackable-text stk-block-text"><p>${body}</p></div>
     </div>
   </div>`;

const RENT_MUC = COL(
  "behandlungsraum-in-muenchen-zu-vermieten",
  "Behandlungsraum in München zu vermieten",
  "Schöner Behandlungsraum in unserem Friseursalon in München, Nähe Goetheplatz, 45 m², " +
    "zu vermieten. Miete 750 € VB. Direkt an der U-Bahn, viel Fenster. 80336 München.",
);
const STUHL_MUC = COL(
  "stuhlmiete-frei-muenchen",
  "Stuhlmiete frei in München",
  "In unserem Salon in München ist ein Stuhl frei zu vermieten. Stuhlmiete 490 € pro Monat.",
);
const SALE_MUC = COL(
  "friseursalon-in-muenchen-uebernahme",
  "Friseursalon in München – Übernahme ab April",
  "Gut laufender Friseursalon in München zu übernehmen. Ablöse 9.999 € VB. 80336 München.",
);
const EQUIPMENT_MUC = COL(
  "casio-registrierkasse",
  "Casio Registrierkasse SE-S100 inkl. Thermorollen",
  "Aus meinem Salon in München zu verkaufen, kaum benutzt, 120 €.",
);
const JOB_MUC = COL(
  "friseur-mwd-gesucht",
  "Friseur (m/w/d) gesucht",
  "Unser Salon in München sucht Verstärkung in Vollzeit. Bewerbung an...",
);
const RENT_BERLIN = COL(
  "stuhlmiete-berlin",
  "Stuhlmiete frei in Berlin Moabit",
  "In unserem Salon in Berlin ist ein Stuhl zu vermieten, 400 € Miete.",
);
const NACHMIETER_MUC = COL(
  "nachmieter-gesucht-muenchen",
  "Nachmieter gesucht München Schwabing-West",
  "Stuhlmiete frei, suche Nachmieter für meinen Salon in München. Auch Ausbildung möglich.",
);
const NO_TITLE = COL("leer", "", "Friseursalon in München zu vermieten.");

const PAGE = [RENT_MUC, STUHL_MUC, SALE_MUC, EQUIPMENT_MUC, JOB_MUC, RENT_BERLIN, NACHMIETER_MUC].join("\n");

test("parseListings extracts title, price, area, content-id and the #slug url from a rental ad", () => {
  const [listing] = parseListings(RENT_MUC, "salon", MUC);
  assert.ok(listing);
  assert.equal(listing.source, "tophair");
  assert.equal(listing.profile, "salon");
  assert.equal(listing.title, "Behandlungsraum in München zu vermieten");
  assert.equal(listing.price, "750 €");
  assert.equal(listing.priceEur, 750);
  assert.equal(listing.areaSqm, 45);
  assert.equal(listing.address, "80336 München");
  assert.equal(listing.url, "https://www.tophair.de/kleinanzeigen/#behandlungsraum-in-muenchen-zu-vermieten");
  assert.match(listing.id, /^[0-9a-f]{12}$/);
});

test("the id is derived from content and is stable across runs", () => {
  const [a] = parseListings(RENT_MUC, "salon", MUC);
  const [b] = parseListings(RENT_MUC, "salon", MUC);
  assert.equal(a?.id, b?.id);
});

test("parseListings keeps München rentals and drops sale/take-over, equipment, and job ads", () => {
  const titles = parseListings(PAGE, "salon", MUC).map((l) => l.title);
  assert.ok(titles.includes("Behandlungsraum in München zu vermieten"), "room rental kept");
  assert.ok(titles.includes("Stuhlmiete frei in München"), "chair rental kept");
  assert.ok(!titles.some((t) => t.includes("Übernahme")), "sale/take-over dropped");
  assert.ok(!titles.some((t) => t.includes("Nachmieter")), "whole-lease hand-over dropped");
  assert.ok(!titles.some((t) => t.includes("Registrierkasse")), "equipment dropped");
  assert.ok(!titles.some((t) => t.includes("(m/w/d)")), "job posting dropped");
});

test("excludeKeywords drops chair rentals but keeps whole-room ads", () => {
  const opts = { ...MUC, excludeKeywords: ["stuhlmiet", "stuhlplatz"] };
  const titles = parseListings(PAGE, "salon", opts).map((l) => l.title);
  assert.ok(!titles.includes("Stuhlmiete frei in München"), "Stuhlmiete ad dropped");
  assert.ok(titles.includes("Behandlungsraum in München zu vermieten"), "whole-room rental kept");
});

test("parseListings drops ads outside the configured region", () => {
  const titles = parseListings(PAGE, "salon", MUC).map((l) => l.title);
  assert.ok(!titles.some((t) => t.includes("Berlin")), "non-München rental dropped");
});

test("a 5-digit price without a separator is not misread as a postal-code address", () => {
  const col = COL(
    "raum-muenchen-vermieten",
    "Behandlungsraum in München zu vermieten",
    "Schöner Raum in unserem Salon in München zu vermieten, Miete 55000 Euro.",
  );
  const [listing] = parseListings(col, "salon", MUC);
  assert.equal(listing?.address, null);
  assert.equal(listing?.priceEur, 55000);
});

test("parseListings skips a column with no title", () => {
  assert.deepEqual(parseListings(NO_TITLE, "salon", MUC), []);
});

test("parseListings tags amenities from the ad text when keywords are supplied", () => {
  const [listing] = parseListings(RENT_MUC, "salon", { ...MUC, amenityKeywords: KEYWORDS });
  assert.equal(listing?.tags?.transit, true);
  assert.equal(listing?.tags?.window, true);
});

test("parseListings omits tags when no amenity keywords are supplied", () => {
  const [listing] = parseListings(RENT_MUC, "salon", MUC);
  assert.equal(listing?.tags, undefined);
});

test("parseListings returns [] when there are no ad columns", () => {
  assert.deepEqual(parseListings("<html><body>kein Treffer</body></html>", "salon", MUC), []);
});

test("isSalonSpaceAd: keeps room/chair rentals, drops sale/take-over, equipment, and jobs", () => {
  // Kept: a premises noun paired with a genuine rental signal.
  assert.equal(isSalonSpaceAd("Behandlungsraum zu vermieten", "schöner Raum in unserem Salon"), true);
  assert.equal(isSalonSpaceAd("Stuhlmiete", "Platz frei in unserem Salon"), true);
  // Dropped: sale / take-over / whole-lease hand-over — a business changing hands isn't a rental.
  assert.equal(isSalonSpaceAd("Friseursalon zu verkaufen", "schöner Salon zu verkaufen"), false);
  assert.equal(isSalonSpaceAd("Friseursalon zur Übernahme", "Ablöse 50.000 €, Nachfolger gesucht"), false);
  assert.equal(isSalonSpaceAd("Nachmieter gesucht", "Stuhlmiete frei, suche Nachmieter"), false);
  // Dropped: equipment-for-sale title and employee-wanted ad.
  assert.equal(isSalonSpaceAd("4 Bedienstühle Anthrazit", "günstig abzugeben"), false);
  assert.equal(isSalonSpaceAd("Friseur (m/w/d) gesucht", "wir suchen für unseren Salon"), false);
});

test("fetchListings makes no request and returns [] when tophair is not enabled", async () => {
  const profile = { key: "room", tophairEnabled: false } as SearchProfile;
  assert.deepEqual(await fetchListings(profile), []);
});