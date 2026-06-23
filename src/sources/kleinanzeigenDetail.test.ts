import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDetailText, parseAreaFromText } from "./kleinanzeigenDetail.js";

test("extractDetailText returns the description block text", () => {
  const html = `<html><body><h1>nav</h1>
    <div id="viewad-description-text">Heller Raum mit Fenster, ca. 18 m².</div></body></html>`;
  assert.equal(extractDetailText(html).trim(), "Heller Raum mit Fenster, ca. 18 m².");
});

test("extractDetailText falls back to body text when no description block", () => {
  const html = `<html><body><p>Schöner Laden, 22 qm.</p></body></html>`;
  assert.match(extractDetailText(html), /Schöner Laden, 22 qm\./);
});

test("parseAreaFromText reads m² and qm", () => {
  assert.equal(parseAreaFromText("Raum, ca. 18 m² groß"), 18);
  assert.equal(parseAreaFromText("20qm Ladenfläche"), 20);
  assert.equal(parseAreaFromText("15,5 m2"), 15.5);
});

test("parseAreaFromText returns null when no area present", () => {
  assert.equal(parseAreaFromText("Schöner Raum, Preis VB"), null);
});

test("parseAreaFromText treats a dot with 1-2 digits as a decimal, not thousands", () => {
  assert.equal(parseAreaFromText("1.5 m²"), 1.5);
  assert.equal(parseAreaFromText("1.500 m²"), 1500);
});
