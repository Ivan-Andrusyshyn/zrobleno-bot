// Тижневі підсумки: кожен 8-й, 15-й, 22-й і 29-й день о 18:00 (Київ) бот пише в коментарі
// під постом поточного дня статистику за минулі 7 днів. Решту логіки бота це не змінює —
// тут лише читаються вже збережені відмітки.
import { tg } from "./telegram.js";
import { store } from "./store.js";
import { TOTAL_DAYS, todayYmd, dayNumber } from "./parse.js";

export const WEEK_DAYS = 7;
const TIMEZONE = (env) => env.TIMEZONE || "Europe/Kiev";
const HOUR = (env) => Number(env.WEEKLY_HOUR ?? 18);
const SITE = (env) => env.SITE_URL || "https://zrobleno.pages.dev";
const MAX_ROWS = 40; // ліміт повідомлення Telegram — 4096 символів

const SQ = { done: "🟩", min: "🟨", miss: "⬛" };
const EMPTY = "⬜";
const ok = (s) => s === "done" || s === "min";

/** Номер тижня, підсумок якого треба опублікувати в цей день (день 8 → 1, 15 → 2 …), інакше null */
export function weekDueOn(day) {
  if (day <= WEEK_DAYS || (day - 1) % WEEK_DAYS !== 0) return null;
  const week = (day - 1) / WEEK_DAYS;
  return week * WEEK_DAYS <= TOTAL_DAYS ? week : null;
}

const range = (week) => [(week - 1) * WEEK_DAYS + 1, week * WEEK_DAYS];

/** Текст підсумку тижня. people/marks — як із store.participantsWithCheckins() */
export function weekSummaryText({ people, marks }, week, site) {
  const [from, to] = range(week);
  const byUser = new Map(people.map((p) => [p.userId, Array(TOTAL_DAYS).fill(null)]));
  for (const m of marks) {
    const arr = byUser.get(m.userId);
    if (arr && m.day >= 1 && m.day <= TOTAL_DAYS) arr[m.day - 1] = m.status;
  }

  const rows = [];
  let silent = 0;
  for (const p of people) {
    const days = byUser.get(p.userId);
    if (!days.slice(0, to).some(Boolean)) continue; // ще жодного разу не відмічався — не рахуємо
    const w = days.slice(from - 1, to);
    const count = w.filter(ok).length;
    if (!w.some(Boolean)) { silent++; continue; }
    let streak = 0;
    for (let i = to - 1; i >= 0 && ok(days[i]); i--) streak++;
    const lastOk = ok(w[WEEK_DAYS - 1]);
    const comeback = lastOk && w.slice(0, -1).some((s) => !ok(s)) && count >= 2;
    rows.push({ name: p.name || p.tgName || "Учасник", w, count, streak, comeback });
  }

  const active = rows.length + silent;
  if (!active) return null;
  const okTotal = rows.reduce((a, r) => a + r.count, 0);
  const pct = Math.round((okTotal / (active * WEEK_DAYS)) * 100);
  const perfect = rows.filter((r) => r.count === WEEK_DAYS).length;
  rows.sort((a, b) => b.count - a.count || b.streak - a.streak || a.name.localeCompare(b.name, "uk"));

  const lines = [
    `📊 Підсумки ${week}-го тижня · дні ${from}–${to}`,
    "",
    `Група: ${pct}% днів зараховано`,
    `Ідеальний тиждень (${WEEK_DAYS}/${WEEK_DAYS}): ${perfect} з ${active}`,
    "",
    ...rows.slice(0, MAX_ROWS).map((r) =>
      `${r.w.map((s) => SQ[s] || EMPTY).join("")} ${r.count}/${WEEK_DAYS}${r.streak >= 3 ? ` 🔥${r.streak}` : ""} — ${r.name}`),
  ];
  if (rows.length > MAX_ROWS) lines.push(`…і ще ${rows.length - MAX_ROWS}`);
  if (silent) lines.push(`${silent} ${silent === 1 ? "учасник" : "учасників"} без відміток цього тижня — чекаємо назад 💪`);

  const back = rows.filter((r) => r.comeback).map((r) => r.name);
  lines.push("");
  if (back.length) lines.push(`↩️ Повернулись після пропуску: ${back.join(", ")}`);
  const [nf, nt] = range(week + 1);
  if (nf <= TOTAL_DAYS) lines.push(`🎯 Новий тиждень: дні ${nf}–${Math.min(nt, TOTAL_DAYS)}`);
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

/** Опублікувати підсумок у групі коментарів під постом поточного дня */
export async function postWeek(env, db, s, week, day, api) {
  const text = weekSummaryText(await db.participantsWithCheckins(), week, SITE(env));
  if (!text) return { posted: false, reason: "немає учасників з відмітками" };
  if (!s.groupId) return { posted: false, reason: "група коментарів не підключена" };
  const root = day ? await db.dayThread(s.groupId, day) : null;
  await api.send(s.groupId, text, root
    ? { reply_parameters: { message_id: root, allow_sending_without_reply: true }, link_preview_options: { is_disabled: true } }
    : { link_preview_options: { is_disabled: true } });
  await db.set({ weeklyPosted: [...new Set([...(s.weeklyPosted || []), week])] });
  return { posted: true, week, underDayPost: !!root };
}

/**
 * Викликається за розкладом (наприклад, щогодини з cron-job.org → /api/weekly?key=...).
 * Публікує лише раз на тиждень: у день 8/15/22/29, не раніше 18:00 за Києвом.
 */
export async function runWeekly(env, { now = new Date(), api } = {}) {
  const db = await store(env.DB);
  const s = await db.all();
  const day = await currentDayOf(db, s, env, now);
  const week = weekDueOn(day);
  if (!week) return { posted: false, day, reason: "сьогодні не день підсумків" };
  if (hourIn(now, TIMEZONE(env)) < HOUR(env)) return { posted: false, day, week, reason: `ще немає ${HOUR(env)}:00` };
  if ((s.weeklyPosted || []).includes(week)) return { posted: false, day, week, reason: "вже опубліковано" };
  return { day, ...(await postWeek(env, db, s, week, day, api || tg(env.BOT_TOKEN))) };
}
