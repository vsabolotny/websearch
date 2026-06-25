import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Listing } from "../types.js";
import {
  chatIds,
  telegramConfigured,
  notifyText,
  notifyDigest,
  chunkMessages,
  TELEGRAM_MAX_MESSAGE,
} from "./telegram.js";

function listing(over: Partial<Listing> = {}): Listing {
  return {
    source: "kleinanzeigen",
    profile: "room",
    id: "1",
    title: "Schöner Salon",
    price: "850 €",
    priceEur: 850,
    areaSqm: 30,
    address: "München",
    url: "https://example.com/1",
    ...over,
  };
}

const realFetch = globalThis.fetch;
const realToken = process.env.TELEGRAM_BOT_TOKEN;
const realChatId = process.env.TELEGRAM_CHAT_ID;

afterEach(() => {
  globalThis.fetch = realFetch;
  process.env.TELEGRAM_BOT_TOKEN = realToken;
  process.env.TELEGRAM_CHAT_ID = realChatId;
});

/** Stub global fetch, recording each request's chat_id, and replying with the given status. */
function stubFetch(status = 200, statusForChat?: (chatId: string) => number) {
  const calls: { chatId: string; text: string }[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    calls.push({ chatId: String(body.chat_id), text: body.text });
    const code = statusForChat ? statusForChat(String(body.chat_id)) : status;
    return new Response("", { status: code });
  }) as unknown as typeof fetch;
  return calls;
}

test("single chat id sends exactly one message to that chat (back-compat)", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "tok";
  process.env.TELEGRAM_CHAT_ID = "12345";
  const calls = stubFetch();
  await notifyText("hello");
  assert.deepEqual(calls.map((c) => c.chatId), ["12345"]);
  assert.equal(calls[0]?.text, "hello");
});

test("comma-separated chat ids fan out one message per chat", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "tok";
  process.env.TELEGRAM_CHAT_ID = "111, 222 ,333";
  const calls = stubFetch();
  await notifyText("hi");
  assert.deepEqual(calls.map((c) => c.chatId), ["111", "222", "333"]);
  assert.ok(calls.every((c) => c.text === "hi"));
});

test("chatIds trims whitespace and drops empty entries", () => {
  process.env.TELEGRAM_CHAT_ID = " 111 ,, 222 , ";
  assert.deepEqual(chatIds(), ["111", "222"]);
});

test("telegramConfigured reflects token and at least one chat id", () => {
  process.env.TELEGRAM_BOT_TOKEN = "tok";
  process.env.TELEGRAM_CHAT_ID = "111";
  assert.equal(telegramConfigured(), true);

  process.env.TELEGRAM_CHAT_ID = " , ";
  assert.equal(telegramConfigured(), false);

  process.env.TELEGRAM_CHAT_ID = "111";
  delete process.env.TELEGRAM_BOT_TOKEN;
  assert.equal(telegramConfigured(), false);
});

test("a failing chat does not stop delivery to the others, and send reports it", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "tok";
  process.env.TELEGRAM_CHAT_ID = "good1,bad,good2";
  const calls = stubFetch(200, (chatId) => (chatId === "bad" ? 403 : 200));
  await assert.rejects(notifyText("hi"), /bad/);
  assert.deepEqual(calls.map((c) => c.chatId), ["good1", "bad", "good2"]);
});

test("chunkMessages keeps several messages in one chunk when they fit", () => {
  const chunks = chunkMessages(["aaa", "bbb", "ccc"], 100);
  assert.deepEqual(chunks, ["aaa\n\nbbb\n\nccc"]);
});

test("chunkMessages starts a new chunk when the next message would overflow the limit", () => {
  // "aaaaa" (5) + "\n\n" (2) + "bbbbb" (5) = 12 > limit 10, so they split.
  const chunks = chunkMessages(["aaaaa", "bbbbb"], 10);
  assert.deepEqual(chunks, ["aaaaa", "bbbbb"]);
});

test("chunkMessages packs greedily up to the exact boundary", () => {
  // "aaaa" + "\n\n" + "bb" = 8 == limit 8 → one chunk; adding "c" would exceed it.
  const chunks = chunkMessages(["aaaa", "bb", "c"], 8);
  assert.deepEqual(chunks, ["aaaa\n\nbb", "c"]);
});

test("chunkMessages gives an over-long message its own chunk instead of dropping it", () => {
  const huge = "x".repeat(20);
  const chunks = chunkMessages(["short", huge, "tail"], 10);
  assert.deepEqual(chunks, ["short", huge, "tail"]);
});

test("notifyDigest delivers every listing within the per-message cap", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "tok";
  process.env.TELEGRAM_CHAT_ID = "12345";
  const calls = stubFetch();
  const listings = Array.from({ length: 20 }, (_, i) =>
    listing({ id: String(i), title: `Salon ${i}`, url: `https://example.com/${i}` }),
  );
  await notifyDigest(listings);

  assert.ok(calls.length >= 1, "at least one chunk is sent");
  assert.ok(calls.every((c) => c.text.length <= TELEGRAM_MAX_MESSAGE), "no chunk exceeds the cap");
  // Every listing's link must appear somewhere across the chunks — nothing dropped.
  const combined = calls.map((c) => c.text).join("");
  for (let i = 0; i < listings.length; i++) {
    assert.ok(combined.includes(`https://example.com/${i}`), `listing ${i} delivered`);
  }
});
