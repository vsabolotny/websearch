import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { chatIds, telegramConfigured, notifyText } from "./telegram.js";

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
