import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { loadCache, saveCache } from "./kleinanzeigenCache.js";

test("loadCache returns {} when the file is missing", async () => {
  const path = join(tmpdir(), `ka-cache-missing-${Date.now()}.json`);
  assert.deepEqual(await loadCache(path), {});
});

test("saveCache then loadCache round-trips entries", async () => {
  const path = join(tmpdir(), `ka-cache-roundtrip-${Date.now()}.json`);
  await saveCache({ "123": { areaSqm: 18, tags: { window: true } } }, path);
  assert.deepEqual(await loadCache(path), { "123": { areaSqm: 18, tags: { window: true } } });
  await rm(path, { force: true });
});
