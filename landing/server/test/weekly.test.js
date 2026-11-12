// Тижневі підсумки: розклад, текст, публікація під постом дня, команди адміна
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeD1 } from "./fake-d1.js";
import { handleUpdate } from "../handler.js";
import { weekDueOn, weekSummaryText, runWeekly } from "../weekly.js";
import { onRequestGet as weeklyFn } from "../../functions/api/weekly.js";
import { __resetSchemaForTests } from "../store.js";

test("weekDueOn: підсумки на 8, 15, 22, 29 день", () => {
  const due = [];
  for (let d = 0; d <= 31; d++) if (weekDueOn(d)) due.push([d, weekDueOn(d)]);
  assert.deepEqual(due, [[8, 1], [15, 2], [22, 3], [29, 4]]);
});

test("текст підсумку", () => {
  const people = [
    { userId: 1, name: "Оля" }, { userId: 2, name: "Олег" }, { userId: 3, tgName: "Ірина К." },
    { userId: 4, name: "Тихий" }, { userId: 5, name: "Без відміток" },
  ];
  const marks = [];
  const put = (u, statuses) => statuses.forEach((s, i) => s && marks.push({ userId: u, day: i + 1, status: s }));
  put(1, ["done", "done", "done", "done", "done", "done", "done", "done"]); // 8-й день не входить у 1-й тиждень
  put(2, ["done", "done", "miss", "done", "min", "done", "done"]);
  put(3, ["done", null, null, null, null, null, null]);
  put(4, ["done", null, null, null, null, null, null]);
  marks.push({ userId: 4, day: 9, status: "done" });
  const t = weekSummaryText({ people, marks }, 1, "https://site");
  assert.match(t, /Підсумки 1-го тижня · дні 1–7/);
  assert.match(t, /🟩🟩🟩🟩🟩🟩🟩 7\/7 🔥7 — Оля/);
  assert.match(t, /🟩🟩⬛🟩🟨🟩🟩 6\/7 🔥4 — Олег/);
  assert.match(t, /🟩⬜⬜⬜⬜⬜⬜ 1\/7 — Ірина К\./);
  assert.ok(t.indexOf("Оля") < t.indexOf("Олег") && t.indexOf("Олег") < t.indexOf("Ірина"));
  assert.match(t, /Ідеальний тиждень \(7\/7\): 1 з 4/); // «Без відміток» не рахується взагалі
  assert.match(t, /Група: 54% днів зараховано/); // (7+6+1+1) / (4*7)
  assert.match(t, /Повернулись після пропуску: Олег/);
  assert.match(t, /Новий тиждень: дні 8–14/);
  assert.doesNotMatch(t, /Без відміток —/);

  const t2 = weekSummaryText({ people, marks }, 2, "https://site");
  assert.match(t2, /дні 8–14/);
  assert.match(t2, /учасник(ів)? без відміток цього тижня/);
  assert.match(weekSummaryText({ people, marks }, 4, "s"), /Новий тиждень: дні 29–30/);
  assert.equal(weekSummaryText({ people: [], marks: [] }, 1, "s"), null);
});

test("розклад: публікує раз, у день 8 після 18:00, під постом дня", async () => {
  __resetSchemaForTests();
  const env = { DB: fakeD1(), ADMIN_CODE: "c", WEBHOOK_SECRET: "s1", CRON_KEY: "k1", BOT_TOKEN: "t", TIMEZONE: "Europe/Kiev" };
  const sent = [];
  const api = {
    call: async (method, body) => { sent.push({ method, ...body }); return {}; },
    send: async (chat_id, text, extra = {}) => { sent.push({ method: "sendMessage", chat_id, text, ...extra }); return {}; },
  };
  const G = -100777;
  let uid = 0;
  const upd = (msg) => handleUpdate({ update_id: ++uid, message: { date: 0, ...msg } }, env, api);
  await upd({ message_id: 1, chat: { id: 42, type: "private" }, from: { id: 42 }, text: "/admin c" });
  await handleUpdate({ update_id: ++uid, my_chat_member: { chat: { id: G, type: "supergroup", title: "Чат" }, new_chat_member: { status: "administrator" } } }, env, api);
  await upd({ message_id: 1, chat: { id: 42, type: "private" }, from: { id: 42 }, text: "/date 10.11.2026" });
  for (let d = 1; d <= 8; d++) {
    await upd({ message_id: d * 100, chat: { id: G, type: "supergroup" }, is_automatic_forward: true, sender_chat: { id: -1 }, text: `День ${d}` });
    if (d <= 7) await upd({ message_id: d * 100 + 1, message_thread_id: d * 100, chat: { id: G, type: "supergroup" }, from: { id: 7, first_name: "Оля" }, text: "✅" });
  }

  const at = (iso) => runWeekly(env, { now: new Date(iso), api });
  assert.equal((await at("2026-11-16T17:00:00Z")).reason, "сьогодні не день підсумків"); // день 7
  assert.match((await at("2026-11-17T15:30:00Z")).reason, /ще немає 18:00/); // день 8, 17:30 Київ
  const r = await at("2026-11-17T16:05:00Z"); // день 8, 18:05 Київ
  assert.deepEqual([r.posted, r.week, r.underDayPost], [true, 1, true]);
  const msg = sent.filter((x) => String(x.chat_id) === String(G) && x.method === "sendMessage").at(-1);
  assert.equal(msg.reply_parameters.message_id, 800);
  assert.match(msg.text, /🟩🟩🟩🟩🟩🟩🟩 7\/7 🔥7 — Оля/);
  assert.equal((await at("2026-11-17T19:00:00Z")).reason, "вже опубліковано");

  // команди адміна: перегляд тільки собі, звичайні учасники — ні
  const before = sent.filter((x) => String(x.chat_id) === String(G)).length;
  await upd({ message_id: 2, chat: { id: 42, type: "private" }, from: { id: 42 }, text: "/week 1" });
  assert.match(sent.at(-1).text, /Попередній перегляд[\s\S]*Підсумки 1-го тижня/);
  assert.equal(sent.at(-1).chat_id, 42);
  await upd({ message_id: 3, chat: { id: 9, type: "private" }, from: { id: 9 }, text: "/week" });
  assert.doesNotMatch(sent.at(-1).text, /Підсумки/);
  assert.equal(sent.filter((x) => String(x.chat_id) === String(G)).length, before);

  // HTTP-ендпойнт: без ключа — 403
  assert.equal((await weeklyFn({ request: new Request("https://x/api/weekly?key=bad"), env })).status, 403);
  assert.equal((await weeklyFn({ request: new Request("https://x/api/weekly?key=s1"), env })).status, 403); // є CRON_KEY → секрет вебхука не підходить
});

test("без будильника: коментар після 18:00 на 8-й день запускає підсумок, рівно один раз", async () => {
  const { onRequestPost: tgFn } = await import("../../functions/api/tg.js");
  __resetSchemaForTests();
  const env = { DB: fakeD1(), ADMIN_CODE: "c", WEBHOOK_SECRET: "s1", BOT_TOKEN: "t", TIMEZONE: "Europe/Kiev" };
  const calls = [];
  const realFetch = globalThis.fetch;
  const RealDate = globalThis.Date;
  globalThis.fetch = async (url, init) => { calls.push({ method: String(url).split("/").pop(), body: JSON.parse(init.body) }); return Response.json({ ok: true, result: {} }); };
  let fakeNow = RealDate.parse("2026-11-17T15:00:00Z"); // день 8, 17:00 Київ
  globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fakeNow])); } static now() { return fakeNow; } };
  try {
    const G = -100777;
    let id = 0;
    const send = async (message) => {
      const pending = [];
      await tgFn({
        request: new Request("https://x/api/tg", { method: "POST", headers: { "x-telegram-bot-api-secret-token": "s1" }, body: JSON.stringify({ update_id: ++id, message: { date: 0, ...message } }) }),
        env, waitUntil: (p) => pending.push(p),
      });
      await Promise.all(pending);
    };
    const pm = (text) => send({ message_id: ++id, chat: { id: 42, type: "private" }, from: { id: 42 }, text });
    await pm("/admin c");
    await handleUpdate({ update_id: 1, my_chat_member: { chat: { id: G, type: "supergroup", title: "Чат" }, new_chat_member: { status: "administrator" } } }, env, { send: async () => {}, call: async () => {} });
    await pm("/date 10.11.2026");
    for (let d = 1; d <= 8; d++) {
      await send({ message_id: d * 100, chat: { id: G, type: "supergroup" }, is_automatic_forward: true, sender_chat: { id: -1 }, text: `День ${d}` });
      if (d < 8) await send({ message_id: d * 100 + 1, message_thread_id: d * 100, chat: { id: G, type: "supergroup" }, from: { id: 7, first_name: "Оля" }, text: `День ${d} ✅` });
    }
    const summaries = () => calls.filter((c) => c.method === "sendMessage" && /Підсумки 1-го тижня/.test(c.body.text));
    await send({ message_id: 900, message_thread_id: 800, chat: { id: G, type: "supergroup" }, from: { id: 7, first_name: "Оля" }, text: "✅" });
    assert.equal(summaries().length, 0, "до 18:00 — нічого");

    fakeNow = RealDate.parse("2026-11-17T16:10:00Z"); // 18:10 Київ
    await Promise.all([ // два коментарі одночасно → все одно один підсумок
      send({ message_id: 901, message_thread_id: 800, chat: { id: G, type: "supergroup" }, from: { id: 8, first_name: "Андрій" }, text: "✅" }),
      send({ message_id: 902, message_thread_id: 800, chat: { id: G, type: "supergroup" }, from: { id: 9, first_name: "Марта" }, text: "привіт" }),
    ]);
    await send({ message_id: 903, message_thread_id: 800, chat: { id: G, type: "supergroup" }, from: { id: 9, first_name: "Марта" }, text: "✅" });
    assert.equal(summaries().length, 1);
    assert.equal(summaries()[0].body.reply_parameters.message_id, 800);

    // особисті повідомлення не запускають підсумок; /week post після автопублікації не дублює автоматику
    await pm("/week post");
    assert.equal(summaries().length, 2); // ручна публікація — завжди, коли просиш
  } finally {
    globalThis.fetch = realFetch;
    globalThis.Date = RealDate;
  }
});

test("ручний /week post позначає тиждень — автоматика потім не дублює", async () => {
  __resetSchemaForTests();
  const env = { DB: fakeD1(), ADMIN_CODE: "c", BOT_TOKEN: "t", TIMEZONE: "Europe/Kiev" };
  const sent = [];
  const api = { call: async () => ({}), send: async (chat_id, text, extra = {}) => { sent.push({ chat_id, text, ...extra }); return {}; } };
  let uid = 0;
  const G = -5;
  const upd = (message) => handleUpdate({ update_id: ++uid, message: { date: 0, ...message } }, env, api);
  await upd({ message_id: 1, chat: { id: 42, type: "private" }, from: { id: 42 }, text: "/admin c" });
  await handleUpdate({ update_id: ++uid, my_chat_member: { chat: { id: G, type: "supergroup", title: "Ч" }, new_chat_member: { status: "administrator" } } }, env, api);
  await upd({ message_id: 2, chat: { id: 42, type: "private" }, from: { id: 42 }, text: "/date 10.11.2026" });
  await upd({ message_id: 10, message_thread_id: 5, chat: { id: G, type: "supergroup" }, from: { id: 7, first_name: "Оля" }, text: "День 1 ✅" });
  await upd({ message_id: 3, chat: { id: 42, type: "private" }, from: { id: 42 }, text: "/week post 1" });
  assert.match(sent.at(-1).text, /Опубліковано підсумок 1-го тижня/);
  const r = await runWeekly(env, { now: new Date("2026-11-17T17:00:00Z"), api });
  assert.equal(r.reason, "вже опубліковано");
});
