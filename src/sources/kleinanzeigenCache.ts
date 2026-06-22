import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AmenityTags } from "../types.js";

export interface CacheEntry {
  areaSqm: number | null;
  tags: AmenityTags;
}
export type EnrichmentCache = Record<string, CacheEntry>;

/** Default on-disk location of the enrichment cache. */
export const CACHE_PATH = fileURLToPath(new URL("../../state/kleinanzeigen-cache.json", import.meta.url));

/** Load the cache; returns {} if the file does not exist or is unreadable. */
export async function loadCache(path: string = CACHE_PATH): Promise<EnrichmentCache> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as EnrichmentCache;
  } catch {
    return {};
  }
}

/** Persist the cache, creating the parent directory if needed. */
export async function saveCache(cache: EnrichmentCache, path: string = CACHE_PATH): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(cache, null, 2) + "\n");
}
