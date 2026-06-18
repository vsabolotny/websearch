import { config } from "./config.js";
import type { Listing } from "./types.js";
import { applyFilters } from "./filter.js";
import { isNew, loadState, markSeen, saveState } from "./state.js";
import { notifyListing, notifyText } from "./notify/telegram.js";
import { fetchListings as fetchIs24 } from "./sources/immoscout24.js";
import { fetchListings as fetchKleinanzeigen } from "./sources/kleinanzeigen.js";

const SOURCES: { name: string; fetch: () => Promise<Listing[]> }[] = [
  { name: "ImmobilienScout24", fetch: fetchIs24 },
  { name: "Kleinanzeigen", fetch: fetchKleinanzeigen },
];

const hasCreds = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);

async function gather(): Promise<Listing[]> {
  const all: Listing[] = [];
  for (const s of SOURCES) {
    try {
      const listings = await s.fetch();
      console.log(`${s.name}: ${listings.length} listings`);
      all.push(...listings);
    } catch (e) {
      console.error(`${s.name} failed:`, (e as Error).message);
    }
  }
  return all;
}

async function main(): Promise<void> {
  const state = await loadState();
  const listings = applyFilters(await gather());
  const fresh = listings.filter((l) => isNew(state, l));

  // First ever run: seed state silently so we don't blast every existing listing.
  if (state.wasEmpty) {
    listings.forEach((l) => markSeen(state, l));
    await saveState(state);
    console.log(`Seeded ${listings.length} existing listings (no alerts on first run).`);
    if (hasCreds) {
      await notifyText(
        `✅ Salon-Monitor gestartet für ${config.regionLabel}. ` +
          `Beobachte ${listings.length} Inserate — ab jetzt nur noch neue.`,
      );
    }
    return;
  }

  console.log(`${fresh.length} new listing(s).`);

  if (!hasCreds) {
    // Dry run: show what would be sent, but DON'T persist — so nothing is missed once configured.
    for (const l of fresh) console.log(`NEW  [${l.source}] ${l.title} — ${l.url}`);
    console.warn("TELEGRAM_BOT_TOKEN/CHAT_ID not set: dry run, state not saved.");
    return;
  }

  for (const l of fresh) {
    try {
      await notifyListing(l);
      markSeen(state, l);
      await new Promise((r) => setTimeout(r, 1200)); // Telegram rate-limit headroom
    } catch (e) {
      console.error(`Failed to notify ${l.url}:`, (e as Error).message);
    }
  }
  await saveState(state);
  console.log("Done.");
}

await main();
