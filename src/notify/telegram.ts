import type { Listing } from "../types.js";
import { amenitySummary } from "../amenities.js";

const API = "https://api.telegram.org";

/** True when both Telegram credentials are present in the environment. */
export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

function creds(): { token: string; chatId: string } {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID environment variables.");
  }
  return { token, chatId };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const SOURCE_LABEL: Record<Listing["source"], string> = {
  immoscout24: "ImmobilienScout24",
  kleinanzeigen: "Kleinanzeigen",
};

function formatListing(l: Listing): string {
  const parts: string[] = [];
  if (l.price) parts.push(l.price);
  if (l.areaSqm != null) parts.push(`${l.areaSqm} m²`);
  const meta = parts.length ? `\n${escapeHtml(parts.join(" · "))}` : "";
  const addr = l.address ? `\n📍 ${escapeHtml(l.address)}` : "";
  const flags = amenitySummary(l.tags);
  const flagLine = flags ? `\n${flags}` : "";
  return (
    `🏠 <b>${escapeHtml(l.title)}</b>${meta}${addr}${flagLine}\n` +
    `<i>${SOURCE_LABEL[l.source]}</i> — <a href="${l.url}">Inserat öffnen</a>`
  );
}

async function send(text: string): Promise<void> {
  const { token, chatId } = creds();
  const res = await fetch(`${API}/bot${token}/sendMessage`, {
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
  console.log("Test message sent.");
}
