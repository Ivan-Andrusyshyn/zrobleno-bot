// Нагороди учасника — ОДНА логіка для сайту (src/app) і бота (server/).
// Усе рахується на льоту з відміток; у базі зберігається лише, що бот уже оголосив (таблиця awards).
//
// participant: { id, days: ('done'|'min'|'miss'|null)[], times?: (ISO|null)[], comments?: { day, text }[] }
// challenge:   { startDate: 'YYYY-MM-DD' | null, currentDay, totalDays }

const TZ = "Europe/Kiev";
const ok = (s) => s === "done" || s === "min";

/** «Шлях»: нагорода за кожну позначку зарахованих днів (✅ або 🟨, не обовʼязково поспіль) */
export const PATH = [
  { at: 1, icon: "👟", short: "Старт", name: "Перший крок", tier: "bronze" },
  { at: 3, icon: "🔥", short: "Розігрів", name: "Розігрів", tier: "bronze" },
  { at: 5, icon: "🎵", short: "У ритмі", name: "У ритмі", tier: "bronze" },
  { at: 7, icon: "💪", short: "Тиждень", name: "Тиждень сили", tier: "silver" },
  { at: 10, icon: "🔟", short: "Десятка", name: "Двозначний", tier: "silver" },
  { at: 14, icon: "📅", short: "2 тижні", name: "Два тижні", tier: "silver" },
  { at: 18, icon: "🚀", short: "Невпинний", name: "Невпинний", tier: "gold" },
  { at: 21, icon: "🌱", short: "Звичка", name: "Звичка народилась", tier: "gold" },
  { at: 25, icon: "⭐", short: "Легенда", name: "Майже легенда", tier: "gold" },
  { at: 30, icon: "🏆", short: "Фінішер", name: "Фінішер", tier: "platinum" },
];

/**
 * Бонусні — можна отримати кілька разів (×N).
 * instant: true — бот вітає одразу відповіддю на коментар; інші — рядком у тижневому підсумку.
 */
export const BONUS = [
  { key: "phoenix", icon: "🪶", short: "Фенікс", name: "Фенікс", tier: "blue", instant: true, rule: "Повернувся одразу після пропуску: після дня з ❌ або без відмітки — ✅ чи 🟨." },
  { key: "perfectWeek", icon: "📆", short: "7 з 7", name: "Ідеальний тиждень", tier: "gold", instant: true, rule: "7 з 7 за тиждень челенджу (дні 1–7, 8–14, 15–21, 22–28)." },
  { key: "weekend", icon: "🛋️", short: "Вихідні", name: "Вихідні під контролем", tier: "silver", instant: false, rule: "Відмітився і в суботу, і в неділю." },
  { key: "storyteller", icon: "✍️", short: "Оповідач", name: "Оповідач", tier: "bronze", instant: false, rule: "Кожні 5 відміток з текстом, а не лише значком." },
  { key: "earlyBird", icon: "🌅", short: "Ранок", name: "Ранній птах", tier: "gold", instant: false, rule: "Кожні 3 відмітки свого дня до 9:00." },
  { key: "nightOwl", icon: "🦉", short: "Сова", name: "Нічна сова", tier: "blue", instant: false, rule: "Врятував день в останній момент: відмітка свого дня після 23:00." },
  { key: "firstOfDay", icon: "🥇", short: "Перший", name: "Перший у дні", tier: "platinum", instant: false, rule: "Першим відмітив свій день (✅ або 🟨)." },
  { key: "minimalist", icon: "🌿", short: "Мінімум", name: "Мінімаліст", tier: "bronze", instant: false, rule: "Кожні 3 мінімуми 🟨 — день не пропав, хоч і було важко." },
];

export const TIER_LABEL = { bronze: "бронза 🥉", silver: "срібло 🥈", gold: "золото 🥇", platinum: "платина 💎" };

/** Прибирає повтор «День 5 ✅ —» на початку коментаря */
export function cleanText(text) {
  const t = text
    .replace(/^\s*д[ен]{1,2}ь\s*№?\s*\d{1,2}\s*/iu, "")
    .replace(/^\s*(✅|✔️|✔|☑️|🟨|🟡|🔶|❌|✖️|✖|⛔)\s*/u, "")
    .replace(/^\s*[—–-]\s*/u, "")
    .trim();
  return t || text.trim();
}

function ymdIn(iso) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
function hourIn(iso) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(new Date(iso)));
}
/** Календарна дата N-го дня челенджу: 2026-11-10 + (N-1) */
function dateOfDay(start, n) {
  const [y, m, d] = start.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n - 1));
}
const ymd = (d) => d.toISOString().slice(0, 10);

/** Хто першим відмітив кожен день (лише відмітки того ж календарного дня) → Map(id → кількість) */
export function firstOfDayCounts(all, ch) {
  const res = new Map();
  if (!ch.startDate) return res;
  for (let i = 0; i < Math.min(ch.currentDay, ch.totalDays); i++) {
    const date = ymd(dateOfDay(ch.startDate, i + 1));
    let best = null;
    for (const p of all) {
      const t = p.times?.[i];
      if (!t || !ok(p.days[i]) || ymdIn(t) !== date) continue;
      if (!best || t < best.t) best = { id: p.id, t };
    }
    if (best) res.set(best.id, (res.get(best.id) ?? 0) + 1);
  }
  return res;
}

export function rewardsOf(p, ch, firstCounts) {
  const cur = Math.min(ch.currentDay, ch.totalDays);
  const days = p.days.slice(0, Math.max(cur, 0));
  const okDays = days.filter(ok).length;

  const reachedOn = new Map();
  let n = 0;
  days.forEach((s, i) => { if (ok(s)) { n++; reachedOn.set(n, i + 1); } });
  const path = PATH.map((m) => {
    const got = okDays >= m.at;
    return { ...m, got, isNew: got && (reachedOn.get(m.at) ?? 0) >= cur - 1 };
  });

  let phoenix = 0;
  for (let i = 1; i < days.length; i++) if (!ok(days[i - 1]) && ok(days[i])) phoenix++;

  let perfectWeek = 0;
  for (let w = 0; (w + 1) * 7 <= days.length; w++) if (days.slice(w * 7, w * 7 + 7).every(ok)) perfectWeek++;

  let weekend = 0, earlyBird = 0, nightOwl = 0;
  if (ch.startDate) {
    for (let i = 0; i < days.length - 1; i++) {
      if (dateOfDay(ch.startDate, i + 1).getUTCDay() === 6 && ok(days[i]) && ok(days[i + 1])) weekend++;
    }
    for (let i = 0; i < days.length; i++) {
      const t = p.times?.[i];
      if (!t || !ok(days[i]) || ymdIn(t) !== ymd(dateOfDay(ch.startDate, i + 1))) continue; // лише у свій день
      const h = hourIn(t);
      if (h < 9) earlyBird++;
      if (h >= 23) nightOwl++;
    }
  }

  const texts = (p.comments ?? []).filter((c) => c.day <= cur && cleanText(c.text).replace(/[^\p{L}\p{N}]/gu, "").length >= 12).length;
  const minimums = days.filter((s) => s === "min").length;
  const gotPath = path.filter((m) => m.got);

  return {
    okDays,
    path,
    next: PATH.find((m) => okDays < m.at) ?? null,
    latest: gotPath.length ? PATH[gotPath.length - 1] : null,
    bonus: {
      phoenix,
      perfectWeek,
      weekend,
      storyteller: Math.floor(texts / 5),
      earlyBird: Math.floor(earlyBird / 3),
      nightOwl,
      firstOfDay: firstCounts.get(p.id) ?? 0,
      minimalist: Math.floor(minimums / 3),
    },
  };
}

/**
 * Список отриманих нагород як стабільні ключі: «path:5», «phoenix:2» (2-й Фенікс) …
 * Бот порівнює його з уже оголошеними, щоб вітати лише нове й ніколи двічі.
 */
export function awardKeys(r) {
  const out = [];
  for (const m of r.path) if (m.got) out.push({ key: `path:${m.at}`, instant: true, path: m });
  for (const b of BONUS) {
    for (let k = 1; k <= r.bonus[b.key]; k++) out.push({ key: `${b.key}:${k}`, instant: b.instant, bonus: b, n: k });
  }
  return out;
}
