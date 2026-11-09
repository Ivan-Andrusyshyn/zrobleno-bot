import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDay, parseStatus, parseNote, parseRegistration, displayName, dayNumber, todayYmd, parseDate } from "../lib/parse.js";

test("номер дня з тексту", () => {
  assert.equal(parseDay("День 5 ✅ — прочитано 15 сторінок"), 5);
  assert.equal(parseDay("день12 🟨"), 12);
  assert.equal(parseDay("Старт! День 1 з 30 · вівторок"), 1);
  assert.equal(parseDay("День 31"), null);
  assert.equal(parseDay("просто коментар"), null);
});

test("статус відмітки", () => {
  assert.equal(parseStatus("День 5 ✅ — 15 сторінок"), "done");
  assert.equal(parseStatus("🟨 мінімум, 1 сторінка"), "min");
  assert.equal(parseStatus("❌ сьогодні пропуск"), "miss");
  assert.equal(parseStatus("✔️ готово"), "done");
  assert.equal(parseStatus("класний пост!"), null);
  assert.equal(parseStatus("🟨 хотів ✅, але мінімум"), "min"); // перший значок
});

test("нотатка після тире", () => {
  assert.equal(parseNote("День 5 ✅ — 15 сторінок"), "15 сторінок");
  assert.equal(parseNote("✅"), null);
});

test("реєстрація", () => {
  const r = parseRegistration("1️⃣ Іван\n2️⃣ Читання\n3️⃣ 1 сторінка\n4️⃣ Хочу читати більше");
  assert.deepEqual(r, { name: "Іван", habit: "Читання", minimum: "1 сторінка", why: "Хочу читати більше" });
  const r2 = parseRegistration("1. Олена\n2. Звичка: біг\n3. Мінімум — 10 хвилин");
  assert.equal(r2.habit, "біг");
  assert.equal(r2.minimum, "10 хвилин");
  assert.equal(parseRegistration("Привіт!"), null);
});

test("імʼя і дати", () => {
  assert.equal(displayName("Іван", "Андрусишин"), "Іван А.");
  assert.equal(displayName("Олена", ""), "Олена");
  assert.equal(dayNumber("2026-11-10", "2026-11-10"), 1);
  assert.equal(dayNumber("2026-11-10", "2026-12-09"), 30);
  assert.equal(todayYmd(new Date("2026-11-09T22:30:00Z"), "Europe/Kiev"), "2026-11-10");
  assert.equal(parseDate("10.11.2026"), "2026-11-10");
  assert.equal(parseDate("31.02.2026"), null);
});
