# Setup checklist — what's left to do

Status of the salon-room monitor and the remaining steps to get it fully running.
Detailed instructions for each item are in [`README.md`](./README.md).

## Done ✅

- [x] Monitor built (ImmobilienScout24 + Kleinanzeigen → Telegram / email).
- [x] Configured for **München** (IS24 radius 10 km; Kleinanzeigen `l6411`, 20 km).
- [x] Filters: **≤ €2,000** rent, **≤ 200 m²** (price-hidden listings kept).
- [x] Telegram bot connected and tested.
- [x] Pushed to GitHub; scheduled GitHub Action runs every 20 min.
- [x] First run seeded existing listings (no spam).

## To do

### 1. Add GitHub Actions secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**.

- [ ] `TELEGRAM_BOT_TOKEN` — from BotFather *(add if not already set)*
- [ ] `TELEGRAM_CHAT_ID` — your chat id *(add if not already set)*

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
Emails the whole current list (58 matches under the €2,000 cap) and sends a Telegram
summary. Routine scheduled runs use **mode = new** and only report fresh listings.

## Tuning knobs (edit `src/config.ts`)

- [ ] `maxPriceEur` — currently `2000`
- [ ] `maxAreaSqm` / `minAreaSqm` — currently `200` / none
- [ ] `is24Lat` / `is24Lon` / `is24RadiusKm` — search center & radius
- [ ] `kleinanzeigenQueries` — keyword searches for chair-rentals
- [ ] cron frequency — `.github/workflows/monitor.yml` (`*/20 * * * *`)
- [ ] Telegram per-listing vs. summary threshold — `TELEGRAM_INDIVIDUAL_LIMIT` in `src/index.ts` (currently `15`)

## Possible next steps (not built yet)

- [ ] More sources (Immowelt, salon-specific platforms) — one new adapter each.
- [ ] A daily/weekly scheduled `full` email digest (separate cron).
- [ ] Richer filters (district, must-contain keywords).
