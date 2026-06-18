# Salon-room monitor

Watches **ImmobilienScout24** (commercial spaces to open your own salon) and **eBay
Kleinanzeigen** (chair/room rentals inside existing salons — "Stuhlmiete") for new
hairdressing listings in your region, and pings you on **Telegram** when something new
appears. Runs for free on a schedule via GitHub Actions.

## How it works

```
sources (IS24 mobile API + Kleinanzeigen HTML)
  → filter (price / area caps)
  → dedupe against state/seen.json
  → Telegram alert for each NEW listing
```

Each source is one adapter in `src/sources/`, so adding more portals later is one new file.

| File | Role |
| --- | --- |
| `src/config.ts` | Region, caps, and search keywords — **edit this first**. |
| `src/sources/immoscout24.ts` | IS24 commercial listings via the mobile JSON API. |
| `src/sources/kleinanzeigen.ts` | Kleinanzeigen Stuhlmiete/salon listings via HTML. |
| `src/state.ts` | Dedup state (`state/seen.json`). |
| `src/notify/telegram.ts` | Telegram delivery. |
| `src/index.ts` | Orchestrator. |

## Setup

### 1. Install

```bash
npm install
```

### 2. Configure your search (`src/config.ts`)

- **`is24Lat` / `is24Lon` / `is24RadiusKm`** — IS24 searches in a radius around a point.
  Set your city-center coordinates and radius. (Default = München, 10 km.)
- **`kleinanzeigenLocationId`** — look it up at
  `https://www.kleinanzeigen.de/s-ort-empfehlungen.json?query=<city>` or read the `l<id>`
  from a search URL (default `6411` = München). Adjust `kleinanzeigenRadiusKm`.
- **`maxPriceEur` / `minAreaSqm` / `maxAreaSqm`** — optional caps. IS24 retail listings are
  quoted per m²; the total is approximated as €/m² × m².
- **`kleinanzeigenQueries`** — keyword searches for the chair-rental side.

### 3. Create a Telegram bot

1. In Telegram, message **@BotFather** → `/newbot` → copy the **bot token**.
2. Start a chat with your new bot and send it any message.
3. Get your **chat id**: open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` and read `result[].message.chat.id`.

Export them locally to test:

```bash
export TELEGRAM_BOT_TOKEN=123:abc
export TELEGRAM_CHAT_ID=987654
npm run notify-test   # should DM you a test message
```

## Running

```bash
npm run is24           # just the IS24 adapter (prints listings)
npm run kleinanzeigen  # just the Kleinanzeigen adapter
npm start              # full run: gather → filter → dedupe → alert
```

- **First run** seeds `state/seen.json` silently (no alert spam) and, from then on, only
  **new** listings trigger a Telegram message.
- Without Telegram env vars, `npm start` does a **dry run**: it prints what it *would*
  send and does not modify state.

## Scheduling (GitHub Actions)

`.github/workflows/monitor.yml` runs every 20 minutes, then commits the updated
`state/seen.json` back to the repo so dedup survives between runs.

1. Push this repo to GitHub.
2. **Settings → Secrets and variables → Actions** → add `TELEGRAM_BOT_TOKEN` and
   `TELEGRAM_CHAT_ID`.
3. **Actions** tab → run *Salon-room monitor* once via **Run workflow** to seed state.

## Notes & limits

- IS24's public website is heavily bot-protected; this uses its lighter-protected **mobile
  API**. If the API changes, the [`fredy`](https://github.com/orangecoding/fredy) project is
  the reference for re-mapping it.
- Be reasonable with the cron frequency; don't hammer the sources.
