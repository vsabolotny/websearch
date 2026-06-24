import { config, type SearchConfig, type SearchProfile } from "./config.js";
import type { Listing, ReportMode } from "./types.js";
import { applyFilters } from "./filter.js";
import { isNew, loadState, markSeen, saveState } from "./state.js";
import { notifyListing, notifyText, telegramConfigured } from "./notify/telegram.js";
import { sendReport, emailConfigured } from "./notify/email.js";
import { fetchListings as fetchIs24 } from "./sources/immoscout24.js";
import { fetchListings as fetchKleinanzeigen } from "./sources/kleinanzeigen.js";
import { fetchListings as fetchImmosuchmaschine } from "./sources/immosuchmaschine.js";
import { fetchListings as fetchMatchoffice } from "./sources/matchoffice.js";
import { fetchListings as fetchTophair } from "./sources/tophair.js";
import { Enricher } from "./sources/enrichment.js";

const SOURCES: { name: string; fetch: (p: SearchProfile, cfg?: SearchConfig) => Promise<Listing[]> }[] = [
  { name: "ImmobilienScout24", fetch: fetchIs24 },
  { name: "Kleinanzeigen", fetch: fetchKleinanzeigen },
  { name: "immosuchmaschine", fetch: fetchImmosuchmaschine },
  { name: "MatchOffice", fetch: fetchMatchoffice },
  { name: "TOP HAIR", fetch: fetchTophair },
];

/** "full" reports every current match; "new" (default) reports only unseen listings. */
const MODE: ReportMode = process.env.MODE === "full" ? "full" : "new";
// Above this count we don't spam Telegram one-by-one; we send a single summary instead.
const TELEGRAM_INDIVIDUAL_LIMIT = 15;

async function gather(): Promise<Listing[]> {
  const all: Listing[] = [];
  for (const profile of config.profiles) {
    for (const s of SOURCES) {
      try {
        const listings = await s.fetch(profile);
        console.log(`${profile.key}/${s.name}: ${listings.length} listings`);
        all.push(...listings);
      } catch (e) {
        console.error(`${profile.key}/${s.name} failed:`, (e as Error).message);
      }
    }
  }
  return all;
}

/**
 * Enrich Kleinanzeigen listings (area + amenity flags) for profiles that opt in. One
 * Enricher per run shares a single cache and fetch budget across all profiles.
 */
async function enrichKleinanzeigen(listings: Listing[]): Promise<void> {
  const enrichKeys = new Set(config.profiles.filter((p) => p.enrichAmenities).map((p) => p.key));
  const targets = listings.filter((l) => l.source === "kleinanzeigen" && enrichKeys.has(l.profile));
  if (!targets.length) return;
  const enricher = new Enricher(config.amenityKeywords);
  try {
    await enricher.enrich(targets);
  } finally {
    await enricher.flush();
  }
}

/** Deliver a report to every configured channel. */
async function dispatch(report: Listing[]): Promise<void> {
  if (emailConfigured()) {
    try {
      await sendReport(report, { mode: MODE, regionLabel: config.regionLabel });
      console.log(`Emailed report of ${report.length} listing(s).`);
    } catch (e) {
      console.error("Email report failed:", (e as Error).message);
    }
  }

  if (telegramConfigured()) {
    if (report.length > TELEGRAM_INDIVIDUAL_LIMIT) {
      await notifyText(
        `📋 ${report.length} Inserate in ${config.regionLabel}` +
          (emailConfigured() ? " — vollständiger Report per E-Mail." : "."),
      );
    } else {
      for (const l of report) {
        try {
          await notifyListing(l);
          await new Promise((r) => setTimeout(r, 1200)); // Telegram rate-limit headroom
        } catch (e) {
          console.error(`Failed to notify ${l.url}:`, (e as Error).message);
        }
      }
    }
  }
}

async function main(): Promise<void> {
  console.log(`Mode: ${MODE}`);
  const state = await loadState();
  const listings = await gather();
  await enrichKleinanzeigen(listings);
  const matches = applyFilters(listings, config.profiles);

  // First ever run in "new" mode: seed silently so we don't blast every existing listing.
  if (state.wasEmpty && MODE === "new") {
    matches.forEach((l) => markSeen(state, l));
    await saveState(state);
    console.log(`Seeded ${matches.length} existing listings (no alerts on first run).`);
    if (telegramConfigured()) {
      await notifyText(
        `✅ Salon-Monitor gestartet für ${config.regionLabel}. ` +
          `Beobachte ${matches.length} Inserate — ab jetzt nur noch neue.`,
      );
    }
    return;
  }

  const report = MODE === "full" ? matches : matches.filter((l) => isNew(state, l));
  console.log(`Reporting ${report.length} listing(s) (${MODE}).`);

  if (!telegramConfigured() && !emailConfigured()) {
    for (const l of report) console.log(`  [${l.source}] ${l.title} — ${l.url}`);
    console.warn("No notification channel configured: dry run, state not saved.");
    return;
  }

  await dispatch(report);

  // Record everything we've now seen so future "new" runs stay correct.
  matches.forEach((l) => markSeen(state, l));
  await saveState(state);
  console.log("Done.");
}

await main();
