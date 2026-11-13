// Медалі в чаті: миттєві привітання, без «залпу», без дублів, «тихі» — у тижневому підсумку
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeD1 } from "./fake-d1.js";
import { handleUpdate } from "../handler.js";
import { __resetSchemaForTests } from "../store.js";
import { postWeek } from "../weekly.js";
import { store } from "../store.js";

const G = -100777;
const RealDate = Date;
let fakeNow = RealDate.parse("2026-11-10T16:00:00Z");
function useClock() {
  globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fakeNow])); } static now() { return fakeNow; } };
}
const at = (iso) => { fakeNow = RealDate.parse(iso); };

async function setup() {
  __resetSchemaForTests();
  const env = { DB: fakeD1(), ADMIN_CODE: "c", TIMEZONE: "Europe/Kiev", REACT_ON_CHECKIN: "0" };
  const sent = [];
  const api = {
    call: async (method, body) => { sent.push({ method, ...body }); return {}; },
    send: async (chat_id, text, extra = {}) => { sent.push({ method: "sendMessage", chat_id: String(chat_id), text, ...extra }); return {}; },
  };
  let uid = 0;
  const upd = (key, msg) => handleUpdate({ update_id: ++uid, [key]: { date: Math.floor(Date.now() / 1000), ...msg } }, env, api);
  const pm = (text) => upd("message", { message_id: ++uid, chat: { id: 42, type: "private" }, from: { id: 42 }, text });
  await pm("/admin c");
  await handleUpdate({ update_id: ++uid, my_chat_member: { chat: { id: G, type: "supergroup", title: "Чат" }, new_chat_member: { status: "administrator" } } }, env, api);
  await pm("/date 10.11.2026");
  const user = { id: 7, first_name: "Аліна" };
  // відмітка дня d о годині hh:mm за Києвом (UTC+2)
  const mark = async (d, emoji, { hour = 18, msgId = 1000 + d, edit = false, from = user, text } = {}) => {
    at(new RealDate(RealDate.UTC(2026, 10, 9 + d, hour - 2, 5)).toISOString());
    await upd(edit ? "edited_message" : "message", { message_id: msgId, chat: { id: G, type: "supergroup" }, from, text: text ?? `День ${d} ${emoji} — ${"зроблено на совість ".repeat(2)}` });
  };
  const chat = () => sent.filter((x) => x.method === "sendMessage" && x.chat_id === String(G));
  return { env, api, sent, pm, mark, chat };
}

test("за замовчуванням вимкнено: медалі не пишуться в чат, а після /medals on — без «залпу»", async () => {
  useClock();
  try {
    const { pm, mark, chat, sent } = await setup();
    for (let d = 1; d <= 4; d++) await mark(d, "✅");
    assert.equal(chat().length, 0);
    await pm("/medals");
    assert.match(sent.at(-1).text, /вимкнено/);
    assert.match(sent.at(-1).text, /Аліна: 👟🔥 · 🥇×4 → 🎵 ще 1/); // єдина учасниця — щодня перша
    await pm("/medals on");
    assert.match(sent.at(-1).text, /увімкнено/);
    assert.equal(chat().length, 0, "після ввімкнення нічого старого не надсилається");
    await mark(5, "✅");
    assert.equal(chat().length, 1);
    const m = chat()[0];
    assert.match(m.text, /🏅 Аліна, нова медаль!\n🎵 «У ритмі» — 5 днів · бронза 🥉/);
    assert.match(m.text, /Наступна: 💪 Тиждень сили — ще 2 дні/);
    assert.match(m.text, /Усі нагороди → https:\/\/zrobleno\.pages\.dev\/p\/1/);
    assert.equal(m.reply_parameters.message_id, 1005);
    assert.equal(m.link_preview_options.is_disabled, true);
  } finally { globalThis.Date = RealDate; }
});

test("перший запуск у живому челенджі: наявні медалі не вітаються", async () => {
  useClock();
  try {
    const { pm, mark, chat, env } = await setup();
    // імітуємо базу «до оновлення»: відмітки є, а записів про медалі — ні
    for (let d = 1; d <= 2; d++) await mark(d, "✅");
    const db = await store(env.DB);
    await env.DB.prepare("DELETE FROM awards").run();
    await db.set({ awardsSeeded: false, medalsInChat: true });
    await mark(3, "✅"); // 🔥 Розігрів — нова, а 👟 Старт уже була
    assert.equal(chat().length, 1);
    assert.match(chat()[0].text, /🔥 «Розігрів»/);
    assert.doesNotMatch(chat()[0].text, /Перший крок/);
  } finally { globalThis.Date = RealDate; }
});

test("кілька медалей однією відміткою — одне повідомлення; Фенікс; без дублів при редагуванні", async () => {
  useClock();
  try {
    const { pm, mark, chat } = await setup();
    await pm("/medals on");
    for (let d = 1; d <= 6; d++) await mark(d, "✅");
    const before = chat().length;
    await mark(7, "✅"); // 💪 Тиждень сили + 📆 7 з 7
    assert.equal(chat().length, before + 1);
    assert.match(chat().at(-1).text, /нові медалі!\n💪 «Тиждень сили».*\n📆 «Ідеальний тиждень» — 7 з 7 за тиждень/);

    await mark(8, "❌");
    await mark(9, "✅");
    assert.match(chat().at(-1).text, /🪶 «Фенікс» — повернення після пропуску/);

    const n = chat().length;
    await mark(9, "❌", { edit: true, msgId: 1009 });
    await mark(9, "✅", { edit: true, msgId: 1009 });
    assert.equal(chat().length, n, "повторно не вітаємо");
  } finally { globalThis.Date = RealDate; }
});

test("«тихі» нагороди — рядком у тижневому підсумку, один раз", async () => {
  useClock();
  try {
    const { env, api, pm, mark, chat } = await setup();
    await pm("/medals on");
    for (let d = 1; d <= 7; d++) await mark(d, "✅", { hour: 7 }); // до 9:00 → 🌅 Ранок ×2
    const instantTexts = chat().map((m) => m.text).join("\n");
    assert.doesNotMatch(instantTexts, /Ранок|Ранній птах/, "Ранок не вітається одразу");
    const db = await store(env.DB);
    const s = await db.all();
    await postWeek(env, db, s, 1, 8, api);
    const sum = chat().at(-1).text;
    assert.match(sum, /🏅 Нові нагороди тижня:\nАліна — .*🌅 Ранок/);
    assert.match(sum, /🥇 Перший/);
    await postWeek(env, db, await db.all(), 1, 8, api);
    assert.doesNotMatch(chat().at(-1).text, /Нові нагороди тижня/, "вдруге не повторюємо");
  } finally { globalThis.Date = RealDate; }
});

test("/medals від не-адміна — тиша, нічого не вмикається", async () => {
  useClock();
  try {
    const { sent, mark, chat, env } = await setup();
    const before = sent.length;
    await handleUpdate({ update_id: 999, message: { date: 0, message_id: 1, chat: { id: 9, type: "private" }, from: { id: 9 }, text: "/medals on" } }, env, { call: async () => ({}), send: async (...a) => sent.push(a) });
    assert.equal(sent.length, before);
    for (let d = 1; d <= 3; d++) await mark(d, "✅");
    assert.equal(chat().length, 0);
  } finally { globalThis.Date = RealDate; }
});
