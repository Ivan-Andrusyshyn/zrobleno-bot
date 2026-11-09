// Повний сценарій бота: функції Cloudflare Pages + D1 (SQLite) + фальшивий Telegram
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeD1 } from "./fake-d1.js";
import { handleUpdate, participantsPayload } from "../handler.js";
import { onRequestPost as tgFn } from "../../functions/api/tg.js";
import { onRequestGet as setupFn } from "../../functions/api/setup.js";
import { onRequestGet as healthFn } from "../../functions/api/health.js";

const env = { DB: fakeD1(), ADMIN_CODE: "code1", WEBHOOK_SECRET: "s1", BOT_TOKEN: "test", TIMEZONE: "Europe/Kiev" };

const sent = [];
const api = {
  call: async (method, body) => { sent.push({ method, ...body }); return {}; },
  send: async (chat_id, text) => { sent.push({ method: "sendMessage", chat_id, text }); return {}; },
};

const G = -100777;
let uid = 0;
const upd = (key, msg) => handleUpdate({ update_id: ++uid, [key]: { date: 0, ...msg } }, env, api);
const pm = (from, text) => upd("message", { message_id: uid, chat: { id: from, type: "private" }, from: { id: from, first_name: "A" }, text });
const fwd = (id, caption) => upd("message", { message_id: id, chat: { id: G, type: "supergroup" }, is_automatic_forward: true, sender_chat: { id: -1001, type: "channel" }, caption });
const comment = (key, id, thread, from, text) => upd(key, { message_id: id, message_thread_id: thread, chat: { id: G, type: "supergroup" }, from, text });

const olena = { id: 7, is_bot: false, first_name: "Олена", last_name: "Коваль" };
const andrii = { id: 8, is_bot: false, first_name: "Андрій" };

test("повний сценарій на D1", async () => {
  await pm(42, "/admin wrong");
  assert.match(sent.at(-1).text, /Невірний код/);
  await pm(42, "/admin code1");
  assert.match(sent.at(-1).text, /Ти адмін/);

  await upd("my_chat_member", { chat: { id: G, type: "supergroup", title: "Чат" }, from: { id: 42 }, old_chat_member: { status: "member" }, new_chat_member: { status: "administrator" } });
  assert.ok(sent.some((s) => s.text?.includes("Мене додано адміном у групу")));

  await fwd(100, "Вітаю у «Зроблено.»!");
  await fwd(200, "День 3 з 30");

  await comment("message", 101, 100, olena, "1️⃣ Олена\n2️⃣ Читання\n3️⃣ 1 сторінка\n4️⃣ Хочу читати більше");
  await comment("message", 201, 200, olena, "✅ — 15 сторінок\nДуже затягнуло");
  assert.ok(sent.some((s) => s.method === "setMessageReaction" && s.message_id === 201));
  await comment("edited_message", 201, 200, olena, "🟨 — лише 1 сторінка");
  await comment("message", 202, 200, andrii, "День 2 ❌ захворів");
  await comment("message", 203, 200, { id: 9, is_bot: false, first_name: "Flood" }, "класний пост!");
  await upd("message", { message_id: 1, message_thread_id: 200, chat: { id: -1009, type: "supergroup" }, from: andrii, text: "День 3 ✅" });

  const data = await participantsPayload(env);
  assert.equal(data.challenge.currentDay, 3);
  assert.equal(data.participants.length, 2);
  const [o, a] = data.participants;
  assert.deepEqual([o.name, o.habit, o.minimum, o.days[2]], ["Олена", "Читання", "1 сторінка", "min"]);
  assert.equal(o.comments[0].text, "🟨 — лише 1 сторінка");
  assert.deepEqual([a.name, a.days[1], a.days[2]], ["Андрій", "miss", null]);

  await pm(8, "/hideme");
  assert.equal((await participantsPayload(env)).participants.length, 1);
  await pm(8, "/showme");
  assert.equal((await participantsPayload(env)).participants.length, 2);

  await pm(42, "/date 10.11.2026");
  await pm(42, "/status");
  const st = sent.filter((s) => s.chat_id === 42).at(-1).text;
  assert.match(st, /Учасників: 2/);
  assert.match(st, /старт 2026-11-10/);
});

test("функції: секрет вебхука, setup, health", async () => {
  const req = (secret) => new Request("https://zrobleno.pages.dev/api/tg", {
    method: "POST", headers: { "x-telegram-bot-api-secret-token": secret }, body: "{}",
  });
  assert.equal((await tgFn({ request: req("bad"), env, waitUntil() {} })).status, 403);
  const pending = [];
  assert.equal((await tgFn({ request: req("s1"), env, waitUntil: (p) => pending.push(p) })).status, 200);
  await Promise.all(pending);

  assert.equal((await setupFn({ request: new Request("https://x/api/setup?key=bad"), env })).status, 403);

  const h = await (await healthFn({ env })).json();
  assert.deepEqual(h, { ok: true, db: true, botToken: true, webhookSecret: true, adminCode: true });
  const h2 = await (await healthFn({ env: { ...env, BOT_TOKEN: undefined } })).json();
  assert.equal(h2.ok, false);
});
