import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./fake-mongo.js";
import { __setDbForTests } from "../lib/db.js";
import { handleUpdate, participantsPayload } from "../lib/handler.js";

process.env.ADMIN_CODE = "code1";
const db = fakeDb();
__setDbForTests(db);

// Фальшивий Telegram: записуємо, що бот надсилав
const sent = [];
const api = {
  call: async (method, body) => { sent.push({ method, ...body }); return {}; },
  send: async (chat_id, text) => { sent.push({ method: "sendMessage", chat_id, text }); return {}; },
};

const G = -100777;
let uid = 0;
const upd = (key, msg) => handleUpdate({ update_id: ++uid, [key]: { date: 0, ...msg } }, api);
const pm = (from, text) => upd("message", { message_id: uid, chat: { id: from, type: "private" }, from: { id: from, first_name: "A" }, text });
const fwd = (id, caption) => upd("message", { message_id: id, chat: { id: G, type: "supergroup" }, is_automatic_forward: true, sender_chat: { id: -1001, type: "channel" }, caption });
const comment = (key, id, thread, from, text) => upd(key, { message_id: id, message_thread_id: thread, chat: { id: G, type: "supergroup" }, from, text });

const olena = { id: 7, is_bot: false, first_name: "Олена", last_name: "Коваль" };
const andrii = { id: 8, is_bot: false, first_name: "Андрій" };

test("повний сценарій", async () => {
  await pm(42, "/admin code1");
  assert.deepEqual((await db.collection("settings").findOne({ _id: "main" })).admins, ["42"]);

  await upd("my_chat_member", { chat: { id: G, type: "supergroup", title: "Чат" }, from: { id: 42 }, old_chat_member: { status: "member" }, new_chat_member: { status: "administrator" } });
  assert.ok(sent.some((s) => s.text?.includes("Мене додано адміном у групу")));

  await fwd(100, "Вітаю у «Зроблено.»! Напиши імʼя, звичку...");
  await fwd(200, "День 3 з 30 · четвер");

  // реєстрація під головним постом
  await comment("message", 101, 100, olena, "1️⃣ Олена\n2️⃣ Читання\n3️⃣ 1 сторінка\n4️⃣ Хочу читати більше");
  // відмітка під постом дня без «День N» у тексті
  await comment("message", 201, 200, olena, "✅ — 15 сторінок\nДуже затягнуло");
  assert.ok(sent.some((s) => s.method === "setMessageReaction" && s.message_id === 201));
  // редагування → 🟨
  await comment("edited_message", 201, 200, olena, "🟨 — лише 1 сторінка");
  // день із тексту
  await comment("message", 202, 200, andrii, "День 2 ❌ захворів");
  // звичайний коментар — ігнор
  await comment("message", 203, 200, { id: 9, is_bot: false, first_name: "Flood" }, "класний пост!");
  // коментар з чужої групи — ігнор
  await upd("message", { message_id: 1, message_thread_id: 200, chat: { id: -1009, type: "supergroup" }, from: andrii, text: "День 3 ✅" });

  const data = await participantsPayload();
  assert.equal(data.challenge.currentDay, 3);
  assert.equal(data.participants.length, 2);
  const [o, a] = data.participants;
  assert.equal(o.name, "Олена");
  assert.equal(o.habit, "Читання");
  assert.equal(o.days[2], "min");
  assert.equal(o.comments[0].text, "🟨 — лише 1 сторінка");
  assert.equal(a.name, "Андрій");
  assert.equal(a.days[1], "miss");
  assert.equal(a.days[2], null);

  // /hideme
  await pm(8, "/hideme");
  assert.equal((await participantsPayload()).participants.length, 1);

  // /status для адміна
  await pm(42, "/status");
  const st = sent.filter((s) => s.chat_id === 42).at(-1).text;
  assert.match(st, /Учасників: 2/);
  assert.match(st, /Постів «День N» побачено: 1/);
});
