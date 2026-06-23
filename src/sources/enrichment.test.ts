import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { Enricher, keywordsHash } from "./enrichment.js";
import { loadCache, saveCache } from "./kleinanzeigenCache.js";
import type { AmenityKeywords, Listing } from "../types.js";

const kw: AmenityKeywords = { window: ["fenster"], transit: ["u-bahn"], alwaysAccessible: ["schlüssel"] };
const noSleep = async (): Promise<void> => {};

function listing(over: Partial<Listing>): Listing {
  return {
    source: "kleinanzeigen", profile: "room", id: "1", title: "t",
    price: null, priceEur: null, areaSqm: null, address: null, url: "https://x/1", ...over,
  };
}

function okHtml(body: string): typeof fetch {
  return (async () => new Response(`<div id="viewad-description-text">${body}</div>`, { status: 200 })) as unknown as typeof fetch;
}

function tmp(tag: string): string {
  return join(tmpdir(), `enr-${Date.now()}-${tag}.json`);
}

test("enrich fills area + tags from the detail page and caches them", async () => {
  const path = tmp("a");
  const e = new Enricher(kw, { cachePath: path, sleep: noSleep, fetchImpl: okHtml("Heller Raum mit Fenster, 18 m²") });
  const l = listing({});
  await e.enrich([l]);
  assert.equal(l.areaSqm, 18);
  assert.deepEqual(l.tags, { window: true });
  await e.flush();
  assert.deepEqual((await loadCache(path)).entries["1"], { areaSqm: 18, tags: { window: true } });
  await rm(path, { force: true });
});

test("enrich applies cached entries without fetching", async () => {
  const path = tmp("b");
  await saveCache({ keywordsHash: keywordsHash(kw), entries: { "1": { areaSqm: 25, tags: { transit: true } } } }, path);
  let calls = 0;
  const fetchImpl = (async () => { calls++; return new Response("", { status: 200 }); }) as unknown as typeof fetch;
  const e = new Enricher(kw, { cachePath: path, sleep: noSleep, fetchImpl });
  const l = listing({});
  await e.enrich([l]);
  assert.equal(calls, 0);
  assert.equal(l.areaSqm, 25);
  assert.deepEqual(l.tags, { transit: true });
  await rm(path, { force: true });
});

test("enrich caches a 404 so the dead ad isn't re-fetched", async () => {
  const path = tmp("c");
  const fetchImpl = (async () => new Response("gone", { status: 404 })) as unknown as typeof fetch;
  const e = new Enricher(kw, { cachePath: path, sleep: noSleep, fetchImpl });
  const l = listing({});
  await e.enrich([l]);
  assert.equal(l.areaSqm, null);
  await e.flush();
  assert.deepEqual((await loadCache(path)).entries["1"], { areaSqm: null, tags: {} });
  await rm(path, { force: true });
});

test("transient errors are counted against the budget but not cached", async () => {
  const path = tmp("g");
  const fetchImpl = (async () => new Response("busy", { status: 503 })) as unknown as typeof fetch;
  const e = new Enricher(kw, { cachePath: path, maxFetches: 1, sleep: noSleep, fetchImpl });
  await e.enrich([listing({ id: "1", url: "https://x/1" }), listing({ id: "2", url: "https://x/2" })]);
  await e.flush();
  // 503 is not cached (retry next run), and the single fetch budget was spent on id 1.
  assert.deepEqual((await loadCache(path)).entries, {});
  await rm(path, { force: true });
});

test("the fetch budget is shared across enrich() calls (per-run cap)", async () => {
  let calls = 0;
  const fetchImpl = (async () => { calls++; return new Response(`<div id="viewad-description-text">Raum 20 m²</div>`, { status: 200 }); }) as unknown as typeof fetch;
  const e = new Enricher(kw, { cachePath: tmp("d"), maxFetches: 1, sleep: noSleep, fetchImpl });
  await e.enrich([listing({ id: "1", url: "https://x/1" })]);
  await e.enrich([listing({ id: "2", url: "https://x/2" })]);
  assert.equal(calls, 1); // budget of 1 exhausted by the first call's listing
});

test("a changed keyword set discards stale cached entries", async () => {
  const path = tmp("e");
  await saveCache({ keywordsHash: "OLD", entries: { "1": { areaSqm: 99, tags: { window: true } } } }, path);
  const e = new Enricher(kw, { cachePath: path, sleep: noSleep, fetchImpl: okHtml("Raum 20 m²") });
  const l = listing({ id: "1", url: "https://x/1" });
  await e.enrich([l]);
  assert.equal(l.areaSqm, 20); // re-fetched, not the stale 99
  await rm(path, { force: true });
});

test("flush does not write a cache file when nothing was fetched", async () => {
  const path = tmp("f");
  const e = new Enricher(kw, { cachePath: path, sleep: noSleep, fetchImpl: okHtml("x") });
  await e.enrich([]);
  await e.flush();
  assert.deepEqual(await loadCache(path), { keywordsHash: "", entries: {} });
  await rm(path, { force: true });
});
