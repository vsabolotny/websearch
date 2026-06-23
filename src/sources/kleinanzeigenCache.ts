import { fileURLToPath } from "node:url";
import { readJsonFile, writeJsonFile } from "../jsonFile.js";
import type { AmenityTags } from "../types.js";

export interface CacheEntry {
  areaSqm: number | null;
  tags: AmenityTags;
}

/** Cached enrichment results, tagged with the keyword set they were computed from. */
export interface CacheFile {
  /** Hash of the AmenityKeywords used; entries are discarded when it changes. */
  keywordsHash: string;
  entries: Record<string, CacheEntry>;
}

/** Default on-disk location of the enrichment cache. */
export const CACHE_PATH = fileURLToPath(new URL("../../state/kleinanzeigen-cache.json", import.meta.url));

/** Load the cache; returns an empty versioned cache if the file is missing, unreadable, or an older shape. */
export async function loadCache(path: string = CACHE_PATH): Promise<CacheFile> {
  const file = await readJsonFile<Partial<CacheFile>>(path, {});
  return { keywordsHash: file.keywordsHash ?? "", entries: file.entries ?? {} };
}

/** Persist the cache, creating the parent directory if needed. */
export async function saveCache(cache: CacheFile, path: string = CACHE_PATH): Promise<void> {
  await writeJsonFile(path, cache);
}
