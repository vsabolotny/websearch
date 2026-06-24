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

const SALON_MUC = COL(
  "friseursalon-in-muenchen-uebernahme",
  "Friseursalon in München – Übernahme ab April",
  "Gut laufender Friseursalon in München, Nähe Goetheplatz, 45 m², zu übernehmen. " +
    "Ablöse 9.999 € VB. Direkt an der U-Bahn, viel Fenster. 80336 München.",
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
const SALON_BERLIN = COL(
  "friseursalon-berlin-uebernahme",
  "Friseursalon in Berlin Moabit zu übernehmen",
  "Etablierter Salon in Berlin, zu verkaufen, 750 € Miete.",
);
const NACHMIETER_MUC = COL(
  "nachmieter-gesucht-muenchen",
  "Nachmieter gesucht München Schwabing-West",
  "Stuhlmiete frei, suche Nachmieter für meinen Salon in München. Auch Ausbildung möglich.",
);
const NO_TITLE = COL("leer", "", "Friseursalon in München zu verkaufen.");

const PAGE = [SALON_MUC, EQUIPMENT_MUC, JOB_MUC, SALON_BERLIN, NACHMIETER_MUC].join("\n");

test("parseListings extracts title, price, area, content-id and the #slug url from a salon ad", () => {
  const [listing] = parseListings(SALON_MUC, "salon", MUC);
  assert.ok(listing);
  assert.equal(listing.source, "tophair");
  assert.equal(listing.profile, "salon");
  assert.equal(listing.title, "Friseursalon in München – Übernahme ab April");
  assert.equal(listing.price, "9.999 €");
  assert.equal(listing.priceEur, 9999);
  assert.equal(listing.areaSqm, 45);
  assert.equal(listing.address, "80336 München");
  assert.equal(listing.url, "https://www.tophair.de/kleinanzeigen/#friseursalon-in-muenchen-uebernahme");
  assert.match(listing.id, /^[0-9a-f]{12}$/);
});

test("the id is derived from content and is stable across runs", () => {
  const [a] = parseListings(SALON_MUC, "salon", MUC);
  const [b] = parseListings(SALON_MUC, "salon", MUC);
  assert.equal(a?.id, b?.id);
});

test("parseListings keeps München salon-space ads and drops equipment + job ads", () => {
  const titles = parseListings(PAGE, "salon", MUC).map((l) => l.title);
  assert.ok(titles.includes("Friseursalon in München – Übernahme ab April"));
  assert.ok(titles.includes("Nachmieter gesucht München Schwabing-West"));
  assert.ok(!titles.some((t) => t.includes("Registrierkasse")), "equipment dropped");
  assert.ok(!titles.some((t) => t.includes("(m/w/d)")), "job posting dropped");
});

test("parseListings drops ads outside the configured region", () => {
  const titles = parseListings(PAGE, "salon", MUC).map((l) => l.title);
  assert.ok(!titles.some((t) => t.includes("Berlin")), "non-München salon dropped");
});

test("a strong signal (Nachmieter/Stuhlmiete) is kept even when the body reads job-ish", () => {
  const [listing] = parseListings(NACHMIETER_MUC, "salon", MUC);
  assert.equal(listing?.title, "Nachmieter gesucht München Schwabing-West");
});

test("a 5-digit price without a separator is not misread as a postal-code address", () => {
  const col = COL(
    "salon-muenchen-ablöse",
    "Friseursalon in München zu verkaufen",
    "Schöner Salon in München zu übernehmen, Ablöse 55000 Euro.",
  );
  const [listing] = parseListings(col, "salon", MUC);
  assert.equal(listing?.address, null);
  assert.equal(listing?.priceEur, 55000);
});

test("parseListings skips a column with no title", () => {
  assert.deepEqual(parseListings(NO_TITLE, "salon", MUC), []);
});

test("parseListings tags amenities from the ad text when keywords are supplied", () => {
  const [listing] = parseListings(SALON_MUC, "salon", { ...MUC, amenityKeywords: KEYWORDS });
  assert.equal(listing?.tags?.transit, true);
  assert.equal(listing?.tags?.window, true);
});

test("parseListings omits tags when no amenity keywords are supplied", () => {
  const [listing] = parseListings(SALON_MUC, "salon", MUC);
  assert.equal(listing?.tags, undefined);
});

test("parseListings returns [] when there are no ad columns", () => {
  assert.deepEqual(parseListings("<html><body>kein Treffer</body></html>", "salon", MUC), []);
});

test("isSalonSpaceAd: equipment title drops, premises+transfer keeps, jobs drop", () => {
  assert.equal(isSalonSpaceAd("4 Bedienstühle Anthrazit", "günstig abzugeben"), false);
  assert.equal(isSalonSpaceAd("Friseursalon zu verkaufen", "schöner Salon zu verkaufen"), true);
  assert.equal(isSalonSpaceAd("Friseur (m/w/d) gesucht", "wir suchen für unseren Salon"), false);
  assert.equal(isSalonSpaceAd("Stuhlmiete", "Platz frei in unserem Salon"), true);
});

test("fetchListings makes no request and returns [] when tophair is not enabled", async () => {
  const profile = { key: "room", tophairEnabled: false } as SearchProfile;
  assert.deepEqual(await fetchListings(profile), []);
});