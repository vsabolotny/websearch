import { test } from "node:test";
import assert from "node:assert/strict";
import { parseListings } from "./matchoffice.js";

const ld = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

const PAGE =
  ld({ "@context": "https://schema.org", "@type": "FAQPage", name: "105 büros: München" }) +
  ld({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "105 büros: München",
    mainEntity: {
      "@type": "ItemList",
      itemListElement: [
        {
          "@type": "Product",
          name: "Büro an der Isar",
          url: "https://www.matchoffice.de/mieten/buro/muenchen-haidhausen/zeppelinstrasse-52248",
        },
        {
          // duplicate of the listing above (MatchOffice repeats items) -> should dedup by id
          "@type": "Product",
          name: "Büro an der Isar (Variante)",
          url: "https://www.matchoffice.de/mieten/buro/muenchen-haidhausen/zeppelinstrasse-52248",
        },
        {
          "@type": "Product",
          name: "Coworking Schwanthalerhöhe",
          url: "https://www.matchoffice.de/mieten/buro/muenchen/landsberger-strasse-126889",
        },
      ],
    },
  });

test("parseListings extracts Products from the JSON-LD ItemList with null price/area", () => {
  const listings = parseListings(PAGE, "salon");
  assert.equal(listings.length, 2);
  assert.deepEqual(listings[0], {
    source: "matchoffice",
    profile: "salon",
    id: "52248",
    title: "Büro an der Isar",
    price: null,
    priceEur: null,
    areaSqm: null,
    address: null,
    url: "https://www.matchoffice.de/mieten/buro/muenchen-haidhausen/zeppelinstrasse-52248",
  });
  assert.equal(listings[1]?.id, "126889");
});

test("parseListings dedups repeated listings by id, keeping the first", () => {
  const listings = parseListings(PAGE, "salon");
  assert.equal(listings.filter((l) => l.id === "52248").length, 1);
  assert.equal(listings.find((l) => l.id === "52248")?.title, "Büro an der Isar");
});

test("parseListings ignores malformed JSON-LD blocks", () => {
  const html = `<script type="application/ld+json">{ not valid json }</script>` + PAGE;
  assert.equal(parseListings(html, "salon").length, 2);
});

test("parseListings returns [] when no JSON-LD listings are present", () => {
  assert.deepEqual(parseListings("<html><body>no data</body></html>", "salon"), []);
});
