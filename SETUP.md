# Setup checklist — what's left to do

Status of the salon-room monitor and the remaining steps to get it fully running.
Detailed instructions for each item are in [`README.md`](./README.md).

## Done ✅

- [x] Monitor built (ImmobilienScout24 + Kleinanzeigen → Telegram / email).
- [x] Configured for **München** (IS24 radius 10 km; Kleinanzeigen `l6411`, 20 km).
- [x] Filters: **room** profile — **≤ €600** rent, **≥ 15 m²** (price-/area-hidden listings kept).
- [x] Telegram bot connected and tested.
- [x] Pushed to GitHub; scheduled GitHub Action runs every 20 min.
- [x] First run seeded existing listings (no spam).

## To do

### 1. Add GitHub Actions secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**.

- [ ] `TELEGRAM_BOT_TOKEN` — from BotFather *(add if not already set)*
- [ ] `TELEGRAM_CHAT_ID` — your chat id, or a comma-separated list to reach several chats
      (e.g. a shared group: `<you>,<group-id>`). See README → *Create a Telegram bot* for
      how to find a group's id. *(add if not already set)*

For email reports (optional but requested):

- [ ] `GMAIL_USER` — the sending Gmail address
- [ ] `GMAIL_APP_PASSWORD` — 16-char **App Password** (needs 2-Step Verification on the
      Google account: Google Account → Security → App passwords)
- [ ] `REPORT_EMAILS` — comma-separated recipient list

### 2. (Optional) Test email locally before relying on it

```bash
export GMAIL_USER=you@gmail.com
export GMAIL_APP_PASSWORD="abcd efgh ijkl mnop"
export REPORT_EMAILS="you@gmail.com, partner@example.com"
npm run email-test   # emails a sample report to the recipients
```

### 3. Get the current full list

Actions tab → **Salon-room monitor** → **Run workflow** → **mode = full**.
Emails the whole current list and sends a Telegram summary. Routine scheduled runs use
**mode = new** and only report fresh listings.

## Tuning knobs (edit `src/config.ts`)

- [ ] `config.profiles[].filters` — per-profile price/size caps (`maxPriceEur` / `minAreaSqm` /
      `maxAreaSqm`); currently **room**: ≤ €600 / ≥ 15 m². Add a second entry for a `salon`
      profile when ready.
- [ ] `config.profiles[].kleinanzeigenQueries` — keyword searches per profile
- [ ] `config.amenityKeywords` — keyword lists that control window / transit / 24-h flags shown
      on Kleinanzeigen listings
- [ ] `is24Lat` / `is24Lon` / `is24RadiusKm` — search center & radius
- [ ] cron frequency — `.github/workflows/monitor.yml` (`*/20 * * * *`)
- [ ] Telegram per-listing vs. summary threshold — `TELEGRAM_INDIVIDUAL_LIMIT` in `src/index.ts` (currently `15`)

> **After deploying this change:** clear `state/seen.json` once (or let the next run do it
> automatically if you delete the file in the repo). The new room-profile queries produce a
> different result set; reseeding means the first run saves all current matches silently
> instead of firing an alert blast.

## Possible next steps (not built yet)

- [ ] More sources (Immowelt, salon-specific platforms) — one new adapter each.
- [ ] A daily/weekly scheduled `full` email digest (separate cron).
- [ ] Richer filters (district, must-contain keywords).
