// Перевірка функцій Netlify: виклик як у справжньому середовищі (Request → Response), база — заглушка
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./fake-mongo.js";
import { __setDbForTests } from "../lib/db.js";
import tg from "../../netlify/functions/tg.mjs";
import participants from "../../netlify/functions/participants.mjs";
import setup from "../../netlify/functions/setup.mjs";

process.env.WEBHOOK_SECRET = "s1";
process.env.BOT_TOKEN = "test";
process.env.REACT_ON_CHECKIN = "0"; // без викликів Telegram у тесті
__setDbForTests(fakeDb());

const post = (body, secret = "s1") => new Request("https://x.netlify.app/api/tg", {
  method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
  body: JSON.stringify(body),
});

test("вебхук: без секрету — 403, з секретом — 200 і запис у базу", async () => {
  assert.equal((await tg(post({}, "wrong"))).status, 403);
  assert.equal((await tg(new Request("https://x/api/tg"))).status, 405);

  const G = -100;
  await tg(post({ update_id: 1, message: { message_id: 200, date: 0, chat: { id: G, type: "supergroup" }, is_automatic_forward: true, sender_chat: { id: -1, type: "channel" }, caption: "День 4" } }));
  const r = await tg(post({ update_id: 2, message: { message_id: 201, message_thread_id: 200, date: 0, chat: { id: G, type: "supergroup" }, from: { id: 5, is_bot: false, first_name: "Марта" }, text: "✅ — 10 хвилин" } }));
  assert.equal(r.status, 200);

  const res = await participants(new Request("https://x/api/participants"));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.match(res.headers.get("netlify-cdn-cache-control"), /s-maxage=60/);
  const data = await res.json();
  assert.equal(data.challenge.currentDay, 4);
  assert.equal(data.participants[0].name, "Марта");
  assert.equal(data.participants[0].days[3], "done");
});

test("setup без ключа — 403", async () => {
  assert.equal((await setup(new Request("https://x/api/setup?key=bad"))).status, 403);
});
