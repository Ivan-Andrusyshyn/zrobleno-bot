// Потоки: який потік у групи, який «поточний», межі дат, закриття з результатами.
import { TOTAL_DAYS, todayYmd, dayNumber } from "./parse.js";

export const TZ = (env) => env?.TIMEZONE || "Europe/Kiev";
export const FINISH_DAYS = 24; // пройшов потік = ≥ 24 зарахованих днів із 30

/**
 * Особистий перший день учасника в потоці: день приєднання або день першої відмітки — що раніше.
 * Хто прийшов на старт (або раніше) — 1. Від цього дня рахуються %, ефективність і тижневі цифри;
 * нумерація днів, підсумки й правило «пройшов = 24/30» лишаються спільними для всіх.
 */
export function personalStartDay(joinedAt, startDate, markedDays, tz = "Europe/Kiev") {
  const first = markedDays.length ? Math.min(...markedDays) : Infinity;
  let joinDay = 1;
  if (startDate && joinedAt) joinDay = dayNumber(startDate, todayYmd(new Date(joinedAt), tz));
  return Math.max(1, Math.min(TOTAL_DAYS, joinDay, first));
}

/** «2026-11-10» + n днів → «2026-…» */
export function addDays(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export const endDate = (st) => (st.startDate ? addDays(st.startDate, (st.totalDays || TOTAL_DAYS) - 1) : null);
/** «2026-11-10» → «10.11» */
export const dm = (ymd) => (ymd ? `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}` : "—");

/** День потоку для дати (1…30; 0 — ще не почався; 31 — завершився); null — немає дати старту */
export function dayOfStream(st, ymd) {
  if (!st.startDate) return null;
  return dayNumber(st.startDate, ymd);
}

/**
 * Потік групи для дати (пост чи коментар). В одній групі потоки йдуть по черзі, тому:
 * той, у чиї дати потрапляє день; якщо такого немає — найближчий майбутній; інакше — останній, що вже йшов.
 * Закриті потоки теж враховуються (щоб відмітку під старим постом не віднести до нового потоку).
 */
export function pickStreamForDate(list, ymd) {
  if (!list.length) return null;
  const dated = list.filter((s) => s.startDate);
  const inRange = dated.find((s) => s.startDate <= ymd && ymd <= endDate(s));
  if (inRange) return inRange;
  const undated = list.find((s) => !s.startDate && s.status === "active");
  if (undated) return undated; // старий режим без дати старту: день — з тексту поста
  const prev = dated.filter((s) => s.startDate <= ymd).sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  if (prev?.status === "active") return prev; // 30 днів минуло, але потік ще не закрили — пізні відмітки
  const next = dated.filter((s) => s.startDate > ymd && s.status === "active").sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  if (next) return next; // пости до старту («старт завтра»)
  return prev ?? list[list.length - 1];
}

/** Усі потоки, привʼязані до групи */
export async function streamsOfGroup(base, chatId) {
  return (await base.streams()).filter((s) => String(s.groupId) === String(chatId));
}

/**
 * «Поточний» потік — для сайту й команд без вибору потоку:
 * активний, що вже йде (найпізніший старт) → активний майбутній (найближчий) → останній закритий.
 */
export function pickCurrent(list, today) {
  const active = list.filter((s) => s.status === "active");
  const running = active.filter((s) => !s.startDate || s.startDate <= today)
    .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || "") || b.id - a.id);
  if (running.length) return running[0];
  const upcoming = active.sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
  if (upcoming.length) return upcoming[0];
  return list.filter((s) => s.status === "closed").sort((a, b) => (b.closedAt || "").localeCompare(a.closedAt || ""))[0] ?? null;
}

export async function currentStream(base, env, now = new Date()) {
  return pickCurrent(await base.streams(), todayYmd(now, TZ(env)));
}

/** Стан потоку для меню: 🟢 йде · ⏳ стартує · ⚪ завершено */
export function streamState(st, today) {
  if (st.status === "closed") return { icon: "⚪", label: "завершено" };
  if (!st.groupId) return { icon: "🔌", label: "чекає на групу" };
  if (st.startDate && st.startDate > today) return { icon: "⏳", label: `старт ${dm(st.startDate)}` };
  if (st.startDate && today > endDate(st)) return { icon: "🏁", label: "30 днів минуло — можна закривати" };
  return { icon: "🟢", label: "йде" };
}

/**
 * Перевірка дат нового потоку в групі: в одній групі потоки не можуть перетинатися.
 * Повертає потік, з яким перетин, або null.
 */
export function overlapIn(list, groupId, startDate) {
  const end = addDays(startDate, TOTAL_DAYS - 1);
  return list.find((s) => s.status === "active" && String(s.groupId) === String(groupId) && s.startDate &&
    !(end < s.startDate || startDate > endDate(s))) ?? null;
}

/** Унікальна назва: «Грудень 2026», а якщо вже є — «Грудень 2026 · 2» */
export function uniqueName(list, name) {
  const names = new Set(list.map((s) => s.name));
  if (!names.has(name)) return name;
  for (let i = 2; ; i++) if (!names.has(`${name} · ${i}`)) return `${name} · ${i}`;
}

/** Результати потоку: хто пройшов (≥ 24 зарахованих днів) */
export async function streamResults(sdb) {
  const rows = await sdb.memberTotals();
  return rows.map((r) => ({ ...r, days: r.ok, finished: r.ok >= FINISH_DAYS }));
}
