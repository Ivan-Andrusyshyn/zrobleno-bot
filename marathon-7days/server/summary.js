// Щоденні підсумки марафону на 7 днів.
// Кожен день з 2-го по 7-й о 18:00 (Київ) бот пише в коментарі під постом дня прогрес
// кожного учасника за всі дні до вчорашнього включно (день 3 → дні 1–2).
// На 8-й день — фінальний підсумок за всі 7 днів: під постом каналу, опублікованим того ж дня
// (наприклад, «Фінал марафону»), а якщо такого немає — окремим повідомленням у групі коментарів. Решту логіки бота це не змінює — тут лише читаються
// вже збережені відмітки.
import { tg } from "./telegram.js";
import { store } from "./store.js";
import { TOTAL_DAYS, todayYmd, dayNumber } from "./parse.js";

const TIMEZONE = (env) => env.TIMEZONE || "Europe/Kiev";
const HOUR = (env) => Number(env.SUMMARY_HOUR ?? 18);
const SITE = (env) => env.SITE_URL || "https://zrobleno-7.pages.dev";
const MAX_ROWS = 40; // ліміт повідомлення Telegram — 4096 символів

const SQ = { done: "🟩", min: "🟨", miss: "⬛" };
const EMPTY = "⬜";
const ok = (s) => s === "done" || s === "min";

/** 1 день, 2 дні, 5 днів */
const daysWord = (n) => {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return "день";
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return "дні";
  return "днів";
};

/** Чи публікувати підсумок у цей день марафону: так для днів 2…8 (8 — фінал) */
export function summaryDueOn(day) {
  return day >= 2 && day <= TOTAL_DAYS + 1;
}

/**
 * Текст підсумку, який публікується в день `day`: рахує дні 1…day-1.
 * people/marks — як із store.participantsWithCheckins()
 */
export function summaryText({ people, marks }, day, site) {
  const upto = Math.min(day - 1, TOTAL_DAYS);
  if (upto < 1) return null;
  const final = upto === TOTAL_DAYS;
  const byUser = new Map(people.map((p) => [p.userId, Array(TOTAL_DAYS).fill(null)]));
  for (const m of marks) {
    const arr = byUser.get(m.userId);
    if (arr && m.day >= 1 && m.day <= TOTAL_DAYS) arr[m.day - 1] = m.status;
  }

  const rows = [];
  for (const p of people) {
    const w = byUser.get(p.userId).slice(0, upto);
    if (!w.some(Boolean)) continue; // ще жодного разу не відмічався — не рахуємо
    const count = w.filter(ok).length;
    let streak = 0;
    for (let i = upto - 1; i >= 0 && ok(w[i]); i--) streak++;
    const comeback = upto >= 2 && ok(w[upto - 1]) && w.slice(0, -1).some((s) => !ok(s)) && count >= 2;
    rows.push({ name: p.name || p.tgName || "Учасник", w, count, streak, comeback });
  }
  if (!rows.length) return null;

  const pct = Math.round((rows.reduce((a, r) => a + r.count, 0) / (rows.length * upto)) * 100);
  const perfect = rows.filter((r) => r.count === upto);
  rows.sort((a, b) => b.count - a.count || b.streak - a.streak || a.name.localeCompare(b.name, "uk"));

  const lines = [
    final
      ? `🏁 Фінал марафону · ${TOTAL_DAYS} ${daysWord(TOTAL_DAYS)}`
      : `📊 Прогрес за ${upto} ${daysWord(upto)} · ${upto === 1 ? "день 1" : `дні 1–${upto}`}`,
    "",
    `Група: ${pct}% днів зараховано`,
    `Без жодного пропуску: ${perfect.length} з ${rows.length}`,
    "",
    ...rows.slice(0, MAX_ROWS).map((r) =>
      `${r.w.map((s) => SQ[s] || EMPTY).join("")} ${r.count}/${upto}${r.streak >= 3 ? ` 🔥${r.streak}` : ""} — ${r.name}`),
  ];
  if (rows.length > MAX_ROWS) lines.push(`…і ще ${rows.length - MAX_ROWS}`);

  lines.push("");
  const back = rows.filter((r) => r.comeback).map((r) => r.name);
  if (back.length) lines.push(`↩️ Повернулись після пропуску: ${back.join(", ")}`);
  if (final) {
    if (perfect.length) lines.push(`🏆 Усі ${TOTAL_DAYS} ${daysWord(TOTAL_DAYS)}: ${perfect.map((r) => r.name).join(", ")}`);
    lines.push("Дякую всім, хто пройшов марафон! 🙌");
  } else {
    lines.push(`🎯 Сьогодні день ${upto + 1} з ${TOTAL_DAYS}${upto + 1 === TOTAL_DAYS ? " — останній!" : ""}`);
  }
  lines.push("", `Статистика кожного → ${site}`);
  return lines.join("\n");
}

export async function currentDayOf(db, s, env, now = new Date()) {
  if (s.startDate) return Math.max(0, Math.min(dayNumber(s.startDate, todayYmd(now, TIMEZONE(env))), TOTAL_DAYS + 1));
  return db.maxDay();
}

function hourIn(now, timeZone) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now));
}

/** Опублікувати підсумок дня `day` (дні 1…day-1) у групі коментарів під постом цього дня */
export async function postSummary(env, db, s, day, api, now = new Date()) {
  const text = summaryText(await db.participantsWithCheckins(), day, SITE(env));
  if (!text) return { posted: false, reason: "немає учасників з відмітками" };
  if (!s.groupId) return { posted: false, reason: "група коментарів не підключена" };
  let root = null;
  if (day <= TOTAL_DAYS) root = await db.dayThread(s.groupId, day);
  else {
    // фінал: якщо сьогодні в каналі вийшов пост (наприклад, «Фінал марафону») — відповідаємо під ним
    const last = await db.latestThread(s.groupId);
    const tz = TIMEZONE(env);
    if (last && todayYmd(new Date(last.created_at), tz) === todayYmd(now, tz)) root = last.msg_id;
  }
  await api.send(s.groupId, text, root
    ? { reply_parameters: { message_id: root, allow_sending_without_reply: true }, link_preview_options: { is_disabled: true } }
    : { link_preview_options: { is_disabled: true } });
  return { posted: true, day, underDayPost: !!root };
}

/**
 * Викликається після кожного повідомлення в групі коментарів (functions/api/tg.js),
 * а також, за бажанням, зовнішнім розкладом через /api/summary?key=...
 * Публікує раз на день: у дні 2…8, не раніше 18:00 за Києвом.
 */
export async function runSummary(env, { now = new Date(), api } = {}) {
  const db = await store(env.DB);
  const s = await db.all();
  const day = await currentDayOf(db, s, env, now);
  if (!summaryDueOn(day)) return { posted: false, day, reason: "сьогодні не день підсумку" };
  if (hourIn(now, TIMEZONE(env)) < HOUR(env)) return { posted: false, day, reason: `ще немає ${HOUR(env)}:00` };
  if (!(await db.claimSummary(day))) return { posted: false, day, reason: "вже опубліковано" };
  try {
    const r = await postSummary(env, db, s, day, api || tg(env.BOT_TOKEN), now);
    if (!r.posted) await db.unclaimSummary(day);
    return { day, ...r };
  } catch (e) {
    await db.unclaimSummary(day); // спробуємо з наступним коментарем
    throw e;
  }
}
