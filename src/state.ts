import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { listingKey, type Listing } from "./types.js";

const STATE_PATH = fileURLToPath(new URL("../state/seen.json", import.meta.url));

export interface SeenState {
  /** Map of "source:id" -> ISO timestamp first seen. */
  seen: Record<string, string>;
  /** True when no state file existed before this run (first ever run). */
  wasEmpty: boolean;
}

export async function loadState(): Promise<SeenState> {
  try {
    const raw = await readFile(STATE_PATH, "utf8");
    const parsed = JSON.parse(raw) as { seen?: Record<string, string> };
    return { seen: parsed.seen ?? {}, wasEmpty: false };
  } catch {
    return { seen: {}, wasEmpty: true };
  }
}

export function isNew(state: SeenState, listing: Listing): boolean {
  return !(listingKey(listing) in state.seen);
}

export function markSeen(state: SeenState, listing: Listing): void {
  const key = listingKey(listing);
  if (!(key in state.seen)) state.seen[key] = new Date().toISOString();
}

export async function saveState(state: SeenState): Promise<void> {
  await mkdir(dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify({ seen: state.seen }, null, 2) + "\n");
}
