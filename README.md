# Salon-room monitor

Watches **ImmobilienScout24** (commercial spaces to open your own salon) and **eBay
Kleinanzeigen** (chair/room rentals inside existing salons — "Stuhlmiete") for new
hairdressing listings in your region, and alerts you via **Telegram** and/or an **email
report** when something new appears. Runs for free on a schedule via GitHub Actions.

Two report modes: **new** (only listings unseen since the last run — the default) and
**full** (the whole current list on demand).

## How it works

```
profiles (config.profiles[])
  → sources (IS24 mobile API + Kleinanzeigen HTML)
      Kleinanzeigen: detail page fetched → area + amenity flags (cached in state/kleinanzeigen-cache.json)
  → filter (price / area caps per profile)
  → dedupe against state/seen.json
  → Telegram alert for each NEW listing
```

Each profile in `config.profiles` is run across all sources independently. Each source is one adapter in `src/sources/`, so adding more portals later is one new file.

| File | Role |
| --- | --- |
| `src/config.ts` | Region, search profiles, and amenity keywords — **edit this first**. |
| `src/sources/immoscout24.ts` | IS24 commercial listings via the mobile JSON API. |
| `src/sources/kleinanzeigen.ts` | Kleinanzeigen Stuhlmiete/salon listings via HTML. |
| `src/state.ts` | Dedup state (`state/seen.json`). |
| `src/notify/telegram.ts` | Telegram delivery (per-listing). |
| `src/notify/email.ts` | Email report delivery (digest) via Gmail SMTP. |
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
- **`profiles`** — array of search profiles, each run independently across all sources.
  Every profile has:
  - `filters` (`maxPriceEur` / `minAreaSqm` / `maxAreaSqm`) — price/size caps. `null` = no
    bound. Listings whose price or area isn't shown are kept so you don't miss hidden-rent ads.
    IS24 retail listings are quoted per m²; the total is approximated as €/m² × m².
  - `is24RealEstateTypes` — IS24 commercial property types to query (e.g. `["store"]`).
  - `kleinanzeigenQueries` — keyword searches for the chair-/room-rental side.
  - `enrichAmenities` — when `true`, Kleinanzeigen detail pages are fetched to fill in area
    and soft amenity flags (window light, transit access, 24-h access). Results are cached in
    `state/kleinanzeigen-cache.json`.

  The current **`room`** profile targets spaces ≤ €600 / ≥ 15 m². A second **`salon`**
  profile (for full commercial premises) can be added as another array entry.
- **`amenityKeywords`** — keyword lists (shared across profiles) that control which
  window / transit / 24-h flags appear on Kleinanzeigen listings in alerts.

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

Telegram and email are both optional and independent — configure either, both, or neither.

### 4. Email reports (optional, Gmail SMTP)

1. On the sending Google account, enable 2-Step Verification, then create an
   **App Password** (Google Account → Security → App passwords).
2. Set the recipients as a comma-separated list.

```bash
export GMAIL_USER=you@gmail.com
export GMAIL_APP_PASSWORD="abcd efgh ijkl mnop"   # the 16-char app password
export REPORT_EMAILS="you@gmail.com, partner@example.com"
npm run email-test   # should email a sample report to the recipients
```

## Running & report modes

```bash
npm run is24           # just the IS24 adapter (prints listings)
npm run kleinanzeigen  # just the Kleinanzeigen adapter
npm start              # MODE=new (default): report only new listings
MODE=full npm start    # report the whole current list (on-demand digest)
```

- **`new`** (default) — only listings unseen since the last run. Telegram sends one message
  per listing; email sends a single digest. The **first** `new` run seeds `state/seen.json`
  silently (no alert spam); after that only genuinely new listings are reported.
- **`full`** — every current match, regardless of history. Email sends the whole list; if
  there are more than 15, Telegram sends a single summary (pointing to the email) instead of
  spamming. Use this for a catch-up of what's currently on the market.
- With **no** channel configured, `npm start` does a **dry run**: prints what it *would*
  send and does not modify state.

## Scheduling (GitHub Actions)

`.github/workflows/monitor.yml` runs every 20 minutes, then commits the updated
`state/seen.json` back to the repo so dedup survives between runs.

1. Push this repo to GitHub.
2. **Settings → Secrets and variables → Actions** → add the secrets you want:
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`,
   `REPORT_EMAILS`.
3. **Actions** tab → run *Salon-room monitor* once via **Run workflow** to seed state.
   The **Run workflow** button has a **mode** dropdown (`new` / `full`) for on-demand full
   reports; the scheduled runs always use `new`.

## Notes & limits

- IS24's public website is heavily bot-protected; this uses its lighter-protected **mobile
  API**. If the API changes, the [`fredy`](https://github.com/orangecoding/fredy) project is
  the reference for re-mapping it.
- Be reasonable with the cron frequency; don't hammer the sources.
