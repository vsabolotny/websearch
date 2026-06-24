# Telegram multi-recipient delivery (CL-258)

## Goal

Let the salon-room monitor push findings to more than one Telegram chat — so the user
and a friend (Natalie) both receive alerts, and ideally into a shared **group** where
they can discuss listings together. Today the bot only ever sends to a single
`TELEGRAM_CHAT_ID`, so adding the bot to a group has no effect: the monitor still
delivers to the one hard-coded personal chat.

## Root cause of "the bot doesn't push to the group"

`src/notify/telegram.ts` reads exactly one `TELEGRAM_CHAT_ID` and calls `sendMessage`
with that single `chat_id`. Adding the bot to a group does nothing unless the
configured chat id *is* the group's id. There is no code path that fans a message out
to several chats. (No Telegram permission is actually missing for groups — a bot that
is a member of a group can post to it; the issue is purely that the group's chat id was
never configured as a destination.)

## Approach

Mirror the pattern already used for email (`REPORT_EMAILS` → `recipients()` array):
make `TELEGRAM_CHAT_ID` accept a **comma-separated list** of chat ids. The env var name
stays the same, so a single id keeps working unchanged (backward compatible).

Changes in `src/notify/telegram.ts`:

- Add `chatIds(): string[]` — split `TELEGRAM_CHAT_ID` on `,`, trim, drop empties
  (same shape as email's `recipients()`).
- `telegramConfigured()` → token present **and** `chatIds().length > 0`.
- `send(text)` → loop over `chatIds()`, POST `sendMessage` once per chat. Attempt every
  chat even if one fails; collect failures and throw an aggregated error at the end so a
  single bad id (e.g. a chat the bot isn't in) doesn't silently swallow delivery to the
  others, and the caller's existing try/catch still logs it.
- `notify-test` script prints which chat ids it sent to (parity with `email-test`).

Docs:

- `SETUP.md` / `README.md`: note that `TELEGRAM_CHAT_ID` may be a comma-separated list
  (personal id, group id, or both) and a one-line "how to get a group chat id" pointer
  (add bot to the group, send a message, read `getUpdates`; the negative id is the
  group). No workflow change — the `TELEGRAM_CHAT_ID` secret name is unchanged.

## UX / behavior

- Set `TELEGRAM_CHAT_ID` to the group's id → both members see findings in the group and
  can discuss them in-thread. This is the ideal the ticket asks for.
- Or set `TELEGRAM_CHAT_ID="<me>,<group>"` to mirror to several chats at once.
- Nothing changes for an existing single-id setup.

## Out of scope

- Per-recipient filtering / different profiles per chat (everyone gets the same alerts).
- A `/start`-driven self-service subscribe flow or a chat-id discovery command — the
  README pointer to `getUpdates` is enough for two known users.
- Channel admin setup (the ticket's "channel" is really a small group; groups need no
  admin rights for the bot to post).

## Test plan (`src/notify/telegram.test.ts`, new)

`fetch` is stubbed; assert on the requests it receives:

1. **Single id** → one `sendMessage` call with that `chat_id` (back-compat).
2. **Comma-separated ids** (`"111, 222 ,333"`) → three calls, one per trimmed id, all
   with the same text.
3. **`chatIds()` parsing** — trims whitespace and drops empty entries from trailing
   commas / double commas.
4. **`telegramConfigured()`** — false when token missing, false when chat id blank/only
   commas, true when token + ≥1 id.
5. **Partial failure** — one chat returns a non-OK response → the other chats are still
   attempted (all calls fire) and `send` throws an aggregated error naming the failed id.
