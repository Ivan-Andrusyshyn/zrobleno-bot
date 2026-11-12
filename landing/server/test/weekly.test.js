// Тижневі підсумки: розклад, текст, публікація під постом дня, команди адміна
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeD1 } from "./fake-d1.js";
import { handleUpdate } from "../handler.js";
import { weekDueOn, weekSummaryText, runWeekly } from "../weekly.js";
import { onRequestGet as weeklyFn } from "../../functions/api/weekly.js";

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
