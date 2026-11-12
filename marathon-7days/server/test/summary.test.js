// Щоденні підсумки марафону: розклад, текст, фінал, команди адміна
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeD1 } from "./fake-d1.js";
import { handleUpdate } from "../handler.js";
import { summaryDueOn, summaryText, runSummary } from "../summary.js";
import { __resetSchemaForTests } from "../store.js";

test("summaryDueOn: дні 2…8", () => {
  const due = [];
  for (let d = 0; d <= 10; d++) if (summaryDueOn(d)) due.push(d);
  assert.deepEqual(due, [2, 3, 4, 5, 6, 7, 8]);
});

const people = [{ userId: 1, name: "Оля" }, { userId: 2, name: "Олег" }, { userId: 3, tgName: "Ірина К." }, { userId: 4, name: "Без відміток" }];
const marks = [];
const put = (u, st) => st.forEach((s, i) => s && marks.push({ userId: u, day: i + 1, status: s }));
put(1, ["done", "done", "done", "done", "done", "done", "done"]);
put(2, ["done", "miss", "done", "min", "done", "done", "done"]);
put(3, ["done", null, null, null, null, null, "min"]);

test("текст: щоденний підсумок рахує дні 1…вчора", () => {
  const t2 = summaryText({ people, marks }, 2, "https://s");
  assert.match(t2, /Прогрес за 1 день · день 1/);
  assert.match(t2, /🟩 1\/1 — Оля/);
  assert.match(t2, /Сьогодні день 2 з 7/);

  const t4 = summaryText({ people, marks }, 4, "https://s");
  assert.match(t4, /Прогрес за 3 дні · дні 1–3/);
  assert.match(t4, /🟩🟩🟩 3\/3 🔥3 — Оля/);
  assert.match(t4, /🟩⬛🟩 2\/3 — Олег/);
  assert.match(t4, /🟩⬜⬜ 1\/3 — Ірина К\./);
  assert.match(t4, /Без жодного пропуску: 1 з 3/);
  assert.match(t4, /Група: 67% днів зараховано/); // (3+2+1)/(3*3)
  assert.match(t4, /Повернулись після пропуску: Олег/);
  assert.doesNotMatch(t4, /Без відміток/);

  assert.match(summaryText({ people, marks }, 7, "s"), /Сьогодні день 7 з 7 — останній!/);
});

test("текст: фінал на 8-й день", () => {
  const t = summaryText({ people, marks }, 8, "https://s");
  assert.match(t, /Фінал марафону · 7 днів/);
  assert.match(t, /🟩🟩🟩🟩🟩🟩🟩 7\/7 🔥7 — Оля/);
  assert.match(t, /🏆 Усі 7 днів: Оля/);
  assert.doesNotMatch(t, /Сьогодні день/);
  assert.equal(summaryText({ people: [], marks: [] }, 3, "s"), null);
  assert.equal(summaryText({ people, marks }, 1, "s"), null);
});

async function setup() {
  __resetSchemaForTests();
  const env = { DB: fakeD1(), ADMIN_CODE: "c", BOT_TOKEN: "t", TIMEZONE: "Europe/Kiev" };
  const sent = [];
  const api = {
    call: async (method, body) => { sent.push({ method, ...body }); return {}; },
    send: async (chat_id, text, extra = {}) => { sent.push({ method: "sendMessage", chat_id: String(chat_id), text, ...extra }); return {}; },
  };
  const G = -100777;
  let uid = 0;
  const upd = (msg) => handleUpdate({ update_id: ++uid, message: { date: 0, ...msg } }, env, api);
  const pm = (text) => upd({ message_id: ++uid, chat: { id: 42, type: "private" }, from: { id: 42 }, text });
  await pm("/admin c");
  await handleUpdate({ update_id: ++uid, my_chat_member: { chat: { id: G, type: "supergroup", title: "Чат" }, new_chat_member: { status: "administrator" } } }, env, api);
  await pm("/date 10.11.2026");
  const groupMsgs = () => sent.filter((x) => x.chat_id === String(G) && x.method === "sendMessage");
  return { env, api, sent, G, upd, pm, groupMsgs };
}

test("розклад: щодня після 18:00 під постом дня, рівно один раз; фінал на 8-й день", async () => {
  const { env, api, G, upd, groupMsgs } = await setup();
  for (let d = 1; d <= 7; d++) {
    await upd({ message_id: d * 100, chat: { id: G, type: "supergroup" }, is_automatic_forward: true, sender_chat: { id: -1 }, text: `День ${d}` });
    await upd({ message_id: d * 100 + 1, message_thread_id: d * 100, chat: { id: G, type: "supergroup" }, from: { id: 7, first_name: "Оля" }, text: "✅" });
  }
  const at = (iso) => runSummary(env, { now: new Date(iso), api });
  assert.equal((await at("2026-11-10T17:00:00Z")).reason, "сьогодні не день підсумку"); // день 1
  assert.match((await at("2026-11-12T15:00:00Z")).reason, /ще немає 18:00/); // день 3, 17:00
  const r = await at("2026-11-12T16:30:00Z"); // день 3, 18:30
  assert.deepEqual([r.posted, r.day, r.underDayPost], [true, 3, true]);
  assert.equal(groupMsgs().at(-1).reply_parameters.message_id, 300);
  assert.match(groupMsgs().at(-1).text, /Прогрес за 2 дні/);
  assert.equal((await at("2026-11-12T19:00:00Z")).reason, "вже опубліковано");

  // фінал: день 8, поста «День 8» немає → окремим повідомленням
  const f = await at("2026-11-17T16:10:00Z");
  assert.deepEqual([f.posted, f.day, f.underDayPost], [true, 8, false]);
  assert.match(groupMsgs().at(-1).text, /Фінал марафону/);
  assert.equal(groupMsgs().at(-1).reply_parameters, undefined);
  assert.equal((await at("2026-11-18T16:10:00Z")).reason, "вже опубліковано"); // після фіналу — тиша, без дублів
});

test("фінал під постом каналу, опублікованим на 8-й день", async () => {
  const { env, api, G, upd, groupMsgs } = await setup();
  await upd({ message_id: 100, chat: { id: G, type: "supergroup" }, is_automatic_forward: true, sender_chat: { id: -1 }, text: "День 1" });
  await upd({ message_id: 101, message_thread_id: 100, chat: { id: G, type: "supergroup" }, from: { id: 7, first_name: "Оля" }, text: "✅" });
  const RealDate = Date;
  const fake = RealDate.parse("2026-11-17T10:00:00Z"); // день 8, ранок — бот запамʼятовує пост «Фінал»
  globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fake])); } static now() { return fake; } };
  try {
    await upd({ message_id: 800, chat: { id: G, type: "supergroup" }, is_automatic_forward: true, sender_chat: { id: -1 }, text: "Фінал марафону!" });
    const f = await runSummary(env, { now: new RealDate("2026-11-17T16:10:00Z"), api });
    assert.equal(f.underDayPost, true);
    assert.equal(groupMsgs().at(-1).reply_parameters.message_id, 800);
  } finally { globalThis.Date = RealDate; }
});

test("/stats: перегляд тільки адміну, /stats post публікує і позначає день", async () => {
  const { env, api, sent, G, upd, pm, groupMsgs } = await setup();
  await upd({ message_id: 101, message_thread_id: 5, chat: { id: G, type: "supergroup" }, from: { id: 7, first_name: "Оля" }, text: "День 1 ✅" });
  await upd({ message_id: 102, message_thread_id: 5, chat: { id: G, type: "supergroup" }, from: { id: 7, first_name: "Оля" }, text: "День 2 🟨" });
  await pm("/stats 2");
  assert.match(sent.at(-1).text, /Попередній перегляд[\s\S]*🟩🟨 2\/2 — Оля/);
  assert.equal(groupMsgs().length, 0);
  await upd({ message_id: 3, chat: { id: 9, type: "private" }, from: { id: 9 }, text: "/stats" });
  assert.doesNotMatch(sent.at(-1).text, /Прогрес/);
  await pm("/stats post 2");
  assert.match(sent.at(-1).text, /Опубліковано підсумок за дні 1–2/);
  assert.equal(groupMsgs().length, 1);
  const r = await runSummary(env, { now: new Date("2026-11-12T17:00:00Z"), api }); // день 3 = підсумок за дні 1–2
  assert.equal(r.reason, "вже опубліковано");
  const menu = sent.find((c) => c.method === "setMyCommands");
  assert.ok(menu.commands.some((c) => c.command === "stats"));
});
