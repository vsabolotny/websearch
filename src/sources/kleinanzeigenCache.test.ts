import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { loadCache, saveCache } from "./kleinanzeigenCache.js";

test("loadCache returns an empty versioned cache when the file is missing", async () => {
  const path = join(tmpdir(), `ka-cache-missing-${Date.now()}.json`);
  assert.deepEqual(await loadCache(path), { keywordsHash: "", entries: {} });
});

test("saveCache then loadCache round-trips the versioned cache", async () => {
  const path = join(tmpdir(), `ka-cache-roundtrip-${Date.now()}.json`);
  const cache = { keywordsHash: "h1", entries: { "123": { areaSqm: 18, tags: { window: true } } } };
  await saveCache(cache, path);
  assert.deepEqual(await loadCache(path), cache);
  await rm(path, { force: true });
});
