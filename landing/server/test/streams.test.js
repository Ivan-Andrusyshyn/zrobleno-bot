// Потоки: групи, потоки по черзі в одній групі, закриття, меню з кнопками
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeD1 } from "./fake-d1.js";
import { handleUpdate, participantsPayload } from "../handler.js";
import { __resetSchemaForTests, store } from "../store.js";

const RealDate = Date;
let fakeNow = RealDate.parse("2026-11-12T10:00:00Z");
const useClock = () => { globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fakeNow])); } static now() { return fakeNow; } }; };
const at = (iso) => { fakeNow = RealDate.parse(iso); };
const sec = () => Math.floor(fakeNow / 1000);

async function setup() {
  __resetSchemaForTests();
  const env = { DB: fakeD1(), ADMIN_CODE: "c", TIMEZONE: "Europe/Kiev", REACT_ON_CHECKIN: "0" };
  const sent = [];
  let msgSeq = 5000;
  const api = {
    call: async (method, body) => { sent.push({ method, ...body }); return method === "sendMessage" ? { message_id: ++msgSeq } : {}; },
    send: async (chat_id, text, extra = {}) => { sent.push({ method: "sendMessage", chat_id: String(chat_id), text, ...extra }); return { message_id: ++msgSeq }; },
  };
  let uid = 0;
  const upd = (u) => handleUpdate({ update_id: ++uid, ...u }, env, api);
  const pm = (text, from = 42) => upd({ message: { date: sec(), message_id: ++uid, chat: { id: from, type: "private" }, from: { id: from }, text } });
  const addBot = (chatId, title) => upd({ my_chat_member: { chat: { id: chatId, type: "supergroup", title }, new_chat_member: { status: "administrator" } } });
  const post = (chatId, msgId, text) => upd({ message: { date: sec(), message_id: msgId, chat: { id: chatId, type: "supergroup" }, is_automatic_forward: true, sender_chat: { id: -1 }, text } });
  const comment = (chatId, msgId, thread, text, from = { id: 7, first_name: "Оля" }) =>
    upd({ message: { date: sec(), message_id: msgId, message_thread_id: thread, chat: { id: chatId, type: "supergroup" }, from, text } });
  const click = (data, from = 42) => upd({ callback_query: { id: String(++uid), from: { id: from }, data, message: { message_id: 1, chat: { id: from, type: "private" } } } });
  const lastMenu = () => sent.filter((x) => x.method === "sendMessage" || x.method === "editMessageText").at(-1);
  await pm("/admin c");
  return { env, api, sent, upd, pm, addBot, post, comment, click, lastMenu };
}
const kbText = (m) => (m.reply_markup?.inline_keyboard || []).flat().map((b) => `${b.text}|${b.callback_data}`);

test("перший запуск: група → потік №1; чужа група без очікуючого потоку не перемикає бота", async () => {
  useClock();
  try {
    const { env, sent, addBot, pm, post, comment } = await setup();
    await addBot(-100, "Основна");
    await pm("/date 10.11.2026");
    const base = await store(env.DB);
    let list = await base.streams();
    assert.equal(list.length, 1);
    assert.equal(list[0].groupId, "-100");
    assert.equal(list[0].startDate, "2026-11-10");

    await addBot(-200, "Чужа");
    assert.match(sent.filter((x) => x.chat_id === "42").at(-1).text, /немає потоку, який чекає на нову групу/);
    list = await base.streams();
    assert.equal(list.length, 1);
    assert.equal(list[0].groupId, "-100", "основна група не змінилась");

    at("2026-11-12T08:00:00Z");
    await post(-100, 300, "День 3");
    await comment(-100, 301, 300, "✅ зроблено");
    await comment(-200, 302, null, "День 3 ✅ з чужої групи");
    const p = await participantsPayload(env);
    assert.equal(p.participants.length, 1);
    assert.equal(p.participants[0].days[2], "done");
    assert.equal((await base.all()).lastSkip.reason, "група не привʼязана до жодного потоку");
  } finally { globalThis.Date = RealDate; }
});

test("потоки по черзі в одній групі: пости й відмітки — у свій потік; пізня відмітка під старим постом — у старий", async () => {
  useClock();
  try {
    const { env, addBot, pm, post, comment } = await setup();
    await addBot(-100, "Основна");
    await pm("/date 10.11.2026");
    const base = await store(env.DB);
    const s2 = await base.createStream({ name: "Грудень 2026", groupId: "-100", groupTitle: "Основна", startDate: "2026-12-10" });

    at("2026-12-09T08:00:00Z"); // день 30 першого потоку
    await post(-100, 3000, "День 30");
    await comment(-100, 3001, 3000, "✅ фініш!");
    at("2026-12-10T08:00:00Z"); // день 1 другого
    await post(-100, 4000, "День 1");
    await comment(-100, 4001, 4000, "✅ новий старт", { id: 8, first_name: "Макс" });
    await comment(-100, 3002, 3000, "✅ дописую вчорашнє", { id: 9, first_name: "Юля" }); // під старим постом

    const v1 = base.forStream(await base.stream(1));
    const v2 = base.forStream(await base.stream(s2));
    const p1 = await v1.participantsWithCheckins();
    const p2 = await v2.participantsWithCheckins();
    assert.deepEqual(p1.marks.map((m) => [m.userId, m.day]).sort(), [[7, 30], [9, 30]]);
    assert.deepEqual(p2.marks.map((m) => [m.userId, m.day]), [[8, 1]]);
    assert.deepEqual(p2.people.map((p) => p.userId), [8]);

    // сайт показує поточний потік — «Грудень»
    const pay = await participantsPayload(env);
    assert.equal(pay.challenge.startDate, "2026-12-10");
    assert.equal(pay.challenge.currentDay, 1);
    assert.deepEqual(pay.participants.map((p) => p.name), ["Макс"]);
  } finally { globalThis.Date = RealDate; }
});

test("друга група: новий потік чекає на групу → додаєш бота → привʼязується, старий працює далі", async () => {
  useClock();
  try {
    const { env, sent, addBot, pm, post, comment } = await setup();
    await addBot(-100, "Основна");
    await pm("/date 10.11.2026");
    const base = await store(env.DB);
    const s2 = await base.createStream({ name: "Листопад · Спорт", startDate: "2026-11-15" });
    await addBot(-300, "Спорт");
    assert.match(sent.filter((x) => x.chat_id === "42").at(-1).text, /підключено до потоку «Листопад · Спорт»/);
    assert.equal((await base.stream(s2)).groupId, "-300");
    assert.equal((await base.stream(1)).groupId, "-100");

    at("2026-11-16T09:00:00Z");
    await post(-100, 700, "День 7");
    await comment(-100, 701, 700, "✅ основний");
    await post(-300, 800, "День 2");
    await comment(-300, 801, 800, "✅ спорт");
    const a = await base.forStream(await base.stream(1)).participantsWithCheckins();
    const b = await base.forStream(await base.stream(s2)).participantsWithCheckins();
    assert.deepEqual(a.marks.map((m) => m.day), [7]);
    assert.deepEqual(b.marks.map((m) => m.day), [2]);
  } finally { globalThis.Date = RealDate; }
});

test("закриття потоку: результати, фінал у групі, відмітки в закритий потік не приймаються", async () => {
  useClock();
  try {
    const { env, sent, addBot, pm, post, comment, click } = await setup();
    await addBot(-100, "Основна");
    await pm("/date 10.11.2026");
    for (let d = 1; d <= 30; d++) {
      at(new RealDate(RealDate.UTC(2026, 10, 9 + d, 8)).toISOString());
      await post(-100, 100 * d, `День ${d}`);
      await comment(-100, 100 * d + 1, 100 * d, "✅", { id: 7, first_name: "Оля" });
      if (d <= 20) await comment(-100, 100 * d + 2, 100 * d, "✅", { id: 8, first_name: "Тарас" });
    }
    at("2026-12-10T10:00:00Z");
    await click("c:1");
    const conf = sent.at(-1);
    assert.match(conf.text, /Пройшли \(≥80% своїх днів; з 1-го дня — 24\/30\): 1 з 2/);
    await click("cc:1:1");
    const fin = sent.filter((x) => x.chat_id === "-100" && x.method === "sendMessage").at(-1);
    assert.match(fin.text, /🏁 Потік «Листопад 2026» завершено!/);
    assert.match(fin.text, /💎 Оля — 30\/30/);
    assert.doesNotMatch(fin.text, /Тарас/, "у фіналі лише фінішери");
    const base = await store(env.DB);
    assert.equal((await base.stream(1)).status, "closed");
    assert.equal((await base.finishedCounts()).get(7), 1);
    assert.equal((await base.finishedCounts()).get(8), undefined);

    await comment(-100, 99999, 3000, "✅ запізнився");
    assert.match((await base.all()).lastSkip.reason, /уже закрито/);
  } finally { globalThis.Date = RealDate; }
});

test("меню: /start → потік; новий потік у тій самій групі — перетин не дозволено, «одразу після» працює", async () => {
  useClock();
  try {
    const { env, sent, addBot, pm, click, lastMenu } = await setup();
    await addBot(-100, "Основна");
    await pm("/date 10.11.2026");
    at("2026-11-16T19:00:00Z");
    await pm("/start");
    let m = lastMenu();
    assert.match(m.text, /🟢 «Листопад 2026» · йде/);
    assert.match(m.text, /день 7 з 30/);
    assert.ok(kbText(m).includes("📊 Статус|st:1"));
    assert.ok(sent.some((x) => x.method === "setWebhook") === false, "без WEBHOOK_SECRET вебхук не чіпаємо");

    await click("n");
    m = lastMenu();
    assert.ok(kbText(m).some((b) => b.startsWith("Одразу після «Листопад 2026» · 10.12|nd:2026-12-10")));
    await click("nd:2026-11-17"); // завтра — перетнеться
    await click("ng:same");
    m = lastMenu();
    assert.match(m.text, /У цій групі ще йде «Листопад 2026»/);
    await click("nd2:2026-12-10");
    m = lastMenu();
    assert.equal(m.text, "Назва потоку?");
    assert.ok(kbText(m).includes("Грудень 2026|nn:auto"));
    await click("nn:auto");
    m = lastMenu();
    assert.match(m.text, /Потік «Грудень 2026»\nСтарт: 10\.12\.2026/);
    await click("ny");
    m = lastMenu();
    assert.match(m.text, /✅ Потік «Грудень 2026» створено/);
    const base = await store(env.DB);
    const list = await base.streams();
    assert.equal(list.length, 2);
    assert.deepEqual([list[1].name, list[1].groupId, list[1].startDate], ["Грудень 2026", "-100", "2026-12-10"]);
  } finally { globalThis.Date = RealDate; }
});

test("меню: своя дата й назва текстом, нова група; чужі натискання ігноруються", async () => {
  useClock();
  try {
    const { env, sent, addBot, pm, click, lastMenu } = await setup();
    await addBot(-100, "Основна");
    await pm("/date 10.11.2026");
    at("2026-11-16T19:00:00Z");
    await click("ndc");
    await pm("31.02");
    assert.match(lastMenu().text, /Не розібрав дату/);
    await pm("5.1");
    assert.match(lastMenu().text, /Старт: 05\.01\.2027/);
    await click("ng:new");
    await click("nnc");
    await pm("Зимовий старт");
    assert.match(lastMenu().text, /Потік «Зимовий старт»[\s\S]*Група: нова/);
    await click("ny");
    assert.match(lastMenu().text, /додай мене адміном у групу коментарів нового каналу/);
    const base = await store(env.DB);
    const z = (await base.streams()).find((s) => s.name === "Зимовий старт");
    assert.equal(z.groupId, null);
    assert.equal(z.startDate, "2027-01-05");

    const n = sent.length;
    await click("cc:1:1", 999); // не адмін
    assert.equal(sent.filter((x, i) => i >= n && x.method !== "answerCallbackQuery").length, 0);
    assert.equal((await base.stream(1)).status, "active");
  } finally { globalThis.Date = RealDate; }
});

test("/start вмикає кнопки у вебхуку, якщо його підключали без callback_query", async () => {
  useClock();
  try {
    const { env, sent, addBot } = await setup();
    await addBot(-100, "Основна");
    env.WEBHOOK_SECRET = "sec";
    const api2 = {
      call: async (method, body) => {
        sent.push({ method, ...body });
        if (method === "getWebhookInfo") return { url: "https://zrobleno.pages.dev/api/tg", allowed_updates: ["message", "edited_message", "my_chat_member"] };
        return {};
      },
      send: async () => ({}),
    };
    await handleUpdate({ update_id: 1, message: { date: 0, message_id: 1, chat: { id: 42, type: "private" }, from: { id: 42 }, text: "/start" } }, env, api2);
    const hook = sent.find((x) => x.method === "setWebhook");
    assert.equal(hook.url, "https://zrobleno.pages.dev/api/tg");
    assert.equal(hook.secret_token, "sec");
    assert.ok(hook.allowed_updates.includes("callback_query"));
  } finally { globalThis.Date = RealDate; }
});

test("пізній учасник: особистий перший день, тижневий підсумок рахує лише його дні", async () => {
  useClock();
  try {
    const { env, api, addBot, pm, post, comment } = await setup();
    await addBot(-100, "Основна");
    await pm("/date 10.11.2026");
    for (let d = 1; d <= 7; d++) {
      at(new RealDate(RealDate.UTC(2026, 10, 9 + d, 8)).toISOString());
      await post(-100, 100 * d, `День ${d}`);
      await comment(-100, 100 * d + 1, 100 * d, "✅", { id: 7, first_name: "Оля" });
      if (d === 5) { // Ніна приходить на 5-й день: анкета, потім відмітки 5–7
        await comment(-100, 9001, 1, "1. Ніна\n2. Вода\n3. 1 склянка\n4. Для здоровʼя", { id: 9, first_name: "Ніна" });
      }
      if (d >= 5) await comment(-100, 100 * d + 2, 100 * d, "✅", { id: 9, first_name: "Ніна" });
    }
    const pay = await participantsPayload(env);
    const by = Object.fromEntries(pay.participants.map((p) => [p.name, p]));
    assert.equal(by["Оля"].startDay, 1);
    assert.equal(by["Ніна"].startDay, 5);

    const { weekSummaryText } = await import("../weekly.js");
    const base = await store(env.DB);
    const v = base.forStream((await base.streams())[0]);
    const t = weekSummaryText(await v.participantsWithCheckins(), 1, "s", [], { startDate: "2026-11-10", tz: "Europe/Kiev" });
    assert.match(t, /▫️▫️▫️▫️🟩🟩🟩 3\/3 🔥3 — Ніна/);
    assert.match(t, /🟩🟩🟩🟩🟩🟩🟩 7\/7 🔥7 — Оля/);
    assert.match(t, /Група: 100% днів зараховано/); // (7 + 3) / (7 + 3)
    assert.match(t, /Ідеальний тиждень \(7\/7\): 1 з 2/);
  } finally { globalThis.Date = RealDate; }
});

test("пізній учасник не отримує Фенікса за свій перший день", async () => {
  const { rewardsOf } = await import("../../shared/rewards.js");
  const days = [null, null, null, null, "done", "done", "done", ...Array(23).fill(null)];
  const ch = { startDate: "2026-11-10", currentDay: 7, totalDays: 30 };
  assert.equal(rewardsOf({ id: 1, days, startDay: 5 }, ch, new Map()).bonus.phoenix, 0);
  assert.equal(rewardsOf({ id: 1, days: ["done", "miss", "done", ...Array(27).fill(null)] }, { ...ch, currentDay: 3 }, new Map()).bonus.phoenix, 1);
});

test("пізній учасник: «пройшов» = 80% своїх днів; хто прийшов за < 14 днів до кінця — без оцінки", async () => {
  useClock();
  try {
    const { env, sent, addBot, pm, post, comment, click } = await setup();
    await addBot(-100, "Основна");
    await pm("/date 10.11.2026");
    for (let d = 1; d <= 30; d++) {
      at(new RealDate(RealDate.UTC(2026, 10, 9 + d, 8)).toISOString());
      await post(-100, 100 * d, `День ${d}`);
      if (d <= 23) await comment(-100, 100 * d + 1, 100 * d, "✅", { id: 7, first_name: "Оля" }); // 23/30 — не пройшла
      if (d >= 11 && d <= 26) await comment(-100, 100 * d + 2, 100 * d, "✅", { id: 9, first_name: "Ніна" }); // з 11-го: 16/20 — пройшла
      if (d >= 11 && d <= 25) await comment(-100, 100 * d + 3, 100 * d, "✅", { id: 10, first_name: "Іра" }); // з 11-го: 15/20 — ні
      if (d >= 20) await comment(-100, 100 * d + 4, 100 * d, "✅", { id: 11, first_name: "Макс" }); // з 20-го: 11 днів — без оцінки
    }
    at("2026-12-10T10:00:00Z");
    await click("c:1");
    assert.match(sent.at(-1).text, /: 1 з 3/);
    assert.match(sent.at(-1).text, /в останні 2 тижні: 1/);
    await click("cc:1:1");
    const fin = sent.filter((x) => x.chat_id === "-100" && x.method === "sendMessage").at(-1).text;
    assert.match(fin, /🏆 Пройшли: 1 з 3/);
    assert.match(fin, /🏆 Ніна — 16\/20 \(з 11-го дня\)/);
    assert.doesNotMatch(fin, /Оля|Іра|Макс —/);
    assert.match(fin, /Ще 1 приєдналися/);
    const base = await store(env.DB);
    const f = await base.finishedCounts();
    assert.equal(f.get(9), 1);
    assert.equal(f.get(7), undefined);
    assert.equal(f.get(10), undefined);
    assert.equal(f.get(11), undefined);
  } finally { globalThis.Date = RealDate; }
});

test("finishRule: 24/30 з першого дня, 16/20 з 11-го, 12/14 з 17-го, з 18-го — без оцінки", async () => {
  const { finishRule } = await import("../streams.js");
  assert.deepEqual(finishRule(1), { span: 30, need: 24 });
  assert.deepEqual(finishRule(11), { span: 20, need: 16 });
  assert.deepEqual(finishRule(17), { span: 14, need: 12 });
  assert.deepEqual(finishRule(18), { span: 13, need: null });
});
