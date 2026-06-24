import type { Listing } from "../types.js";
import { amenitySummary } from "../amenities.js";

const API = "https://api.telegram.org";

/** True when the bot token and at least one chat id are present in the environment. */
export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && chatIds().length);
}

/** Destination chat ids — `TELEGRAM_CHAT_ID` is a comma-separated list (one id also works). */
export function chatIds(): string[] {
  return (process.env.TELEGRAM_CHAT_ID ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("Missing TELEGRAM_BOT_TOKEN environment variable.");
  return t;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const SOURCE_LABEL: Record<Listing["source"], string> = {
  immoscout24: "ImmobilienScout24",
  kleinanzeigen: "Kleinanzeigen",
  immosuchmaschine: "immosuchmaschine",
  matchoffice: "MatchOffice",
  tophair: "TOP HAIR",
};

function formatListing(l: Listing): string {
  const parts: string[] = [];
  if (l.price) parts.push(l.price);
  if (l.areaSqm != null) parts.push(`${l.areaSqm} m²`);
  const meta = parts.length ? `\n${escapeHtml(parts.join(" · "))}` : "";
  const addr = l.address ? `\n📍 ${escapeHtml(l.address)}` : "";
  const flags = amenitySummary(l.tags);
  const flagLine = flags ? `\n${escapeHtml(flags)}` : "";
  return (
    `🏠 <b>${escapeHtml(l.title)}</b>${meta}${addr}${flagLine}\n` +
    `<i>${SOURCE_LABEL[l.source]}</i> — <a href="${escapeHtml(l.url)}">Inserat öffnen</a>`
  );
}

async function sendToChat(tok: string, chatId: string, text: string): Promise<void> {
  const res = await fetch(`${API}/bot${tok}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`Telegram sendMessage failed: ${res.status} ${await res.text()}`);
  }
}

// Deliver to every configured chat. One failing chat (e.g. a chat the bot isn't in) must
// not stop delivery to the others, so all are attempted and failures are reported together.
async function send(text: string): Promise<void> {
  const tok = token();
  const failures: string[] = [];
  for (const chatId of chatIds()) {
    try {
      await sendToChat(tok, chatId, text);
    } catch (e) {
      failures.push(`${chatId}: ${(e as Error).message}`);
    }
  }
  if (failures.length) {
    throw new Error(`Telegram delivery failed for ${failures.length} chat(s) — ${failures.join("; ")}`);
  }
}

/** Send one notification per new listing. */
export async function notifyListing(listing: Listing): Promise<void> {
  await send(formatListing(listing));
}

/** Send a plain status/text message. */
export async function notifyText(text: string): Promise<void> {
  await send(escapeHtml(text));
}

// `npm run notify-test` — sends a test message to confirm credentials work.
if (import.meta.url === `file://${process.argv[1]}`) {
  await notifyText("✅ Salon-room monitor: Telegram connection works.");
  console.log("Test message sent to:", chatIds().join(", "));
}
