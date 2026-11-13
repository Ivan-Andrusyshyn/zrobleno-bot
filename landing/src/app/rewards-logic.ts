// Нагороди учасника. Усе рахується на льоту з відміток — у базі нічого окремо не зберігається.
import { ChallengeInfo, DayStatus, Participant, cleanText } from './models';

export type Tier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'blue';
const TZ = 'Europe/Kiev';
const ok = (s: DayStatus | undefined) => s === 'done' || s === 'min';

/** «Шлях»: нагорода за кожну позначку зарахованих днів (✅ або 🟨, не обовʼязково поспіль) */
export const PATH = [
  { at: 1, icon: '👟', short: 'Старт', name: 'Перший крок', tier: 'bronze' },
  { at: 3, icon: '🔥', short: 'Розігрів', name: 'Розігрів', tier: 'bronze' },
  { at: 5, icon: '🎵', short: 'У ритмі', name: 'У ритмі', tier: 'bronze' },
  { at: 7, icon: '💪', short: 'Тиждень', name: 'Тиждень сили', tier: 'silver' },
  { at: 10, icon: '🔟', short: 'Десятка', name: 'Двозначний', tier: 'silver' },
  { at: 14, icon: '📅', short: '2 тижні', name: 'Два тижні', tier: 'silver' },
  { at: 18, icon: '🚀', short: 'Невпинний', name: 'Невпинний', tier: 'gold' },
  { at: 21, icon: '🌱', short: 'Звичка', name: 'Звичка народилась', tier: 'gold' },
  { at: 25, icon: '⭐', short: 'Легенда', name: 'Майже легенда', tier: 'gold' },
  { at: 30, icon: '🏆', short: 'Фінішер', name: 'Фінішер', tier: 'platinum' },
] as const satisfies readonly { at: number; icon: string; short: string; name: string; tier: Tier }[];

/** Бонусні — можна отримати кілька разів (×N) */
export const BONUS = [
  { key: 'phoenix', icon: '🪶', short: 'Фенікс', name: 'Фенікс', tier: 'blue', rule: 'Повернувся одразу після пропуску: після дня з ❌ або без відмітки — ✅ чи 🟨.' },
  { key: 'perfectWeek', icon: '📆', short: '7 з 7', name: 'Ідеальний тиждень', tier: 'gold', rule: '7 з 7 за тиждень челенджу (дні 1–7, 8–14, 15–21, 22–28).' },
  { key: 'weekend', icon: '🛋️', short: 'Вихідні', name: 'Вихідні під контролем', tier: 'silver', rule: 'Відмітився і в суботу, і в неділю.' },
  { key: 'storyteller', icon: '✍️', short: 'Оповідач', name: 'Оповідач', tier: 'bronze', rule: 'Кожні 5 відміток з текстом, а не лише значком.' },
  { key: 'earlyBird', icon: '🌅', short: 'Ранок', name: 'Ранній птах', tier: 'gold', rule: 'Кожні 3 відмітки свого дня до 9:00.' },
  { key: 'nightOwl', icon: '🦉', short: 'Сова', name: 'Нічна сова', tier: 'blue', rule: 'Врятував день в останній момент: відмітка свого дня після 23:00.' },
  { key: 'firstOfDay', icon: '🥇', short: 'Перший', name: 'Перший у дні', tier: 'platinum', rule: 'Першим відмітив свій день (✅ або 🟨).' },
  { key: 'minimalist', icon: '🌿', short: 'Мінімум', name: 'Мінімаліст', tier: 'bronze', rule: 'Кожні 3 мінімуми 🟨 — день не пропав, хоч і було важко.' },
] as const satisfies readonly { key: string; icon: string; short: string; name: string; tier: Tier; rule: string }[];
export type BonusKey = (typeof BONUS)[number]['key'];

export interface Rewards {
  okDays: number;
  path: { at: number; icon: string; short: string; name: string; tier: Tier; got: boolean; isNew: boolean }[];
  next: (typeof PATH)[number] | null;
  latest: (typeof PATH)[number] | null;
  bonus: Record<BonusKey, number>;
  /** чи є дані про час відміток (без /date — ні) */
  hasTimes: boolean;
}

function ymdIn(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}
function hourIn(iso: string): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso)));
}
/** Календарна дата N-го дня челенджу: 2026-11-10 + (N-1) */
function dateOfDay(start: string, n: number): Date {
  const [y, m, d] = start.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n - 1));
}
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Хто першим відмітив кожен день (лише відмітки, зроблені того ж календарного дня).
 * Повертає Map: id учасника → кількість «Перший у дні».
 */
export function firstOfDayCounts(all: Participant[], ch: ChallengeInfo): Map<number, number> {
  const res = new Map<number, number>();
  if (!ch.startDate) return res;
  for (let i = 0; i < Math.min(ch.currentDay, ch.totalDays); i++) {
    const date = ymd(dateOfDay(ch.startDate, i + 1));
    let best: { id: number; t: string } | null = null;
    for (const p of all) {
      const t = p.times?.[i];
      if (!t || !ok(p.days[i]) || ymdIn(t) !== date) continue;
      if (!best || t < best.t) best = { id: p.id, t };
    }
    if (best) res.set(best.id, (res.get(best.id) ?? 0) + 1);
  }
  return res;
}

export function rewardsOf(p: Participant, ch: ChallengeInfo, firstCounts: Map<number, number>): Rewards {
  const cur = Math.min(ch.currentDay, ch.totalDays);
  const days = p.days.slice(0, Math.max(cur, 0));
  const okDays = days.filter(ok).length;

  // день, на якому досягнуто кожну позначку «Шляху» — щоб підсвітити свіжу «нова»
  const reachedOn = new Map<number, number>();
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
  const hasTimes = !!ch.startDate && !!p.times;
  if (ch.startDate) {
    for (let i = 0; i < days.length - 1; i++) {
      // субота i та неділя i+1, обидві зараховані
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

  const texts = (p.comments ?? []).filter((c) => c.day <= cur && cleanText(c.text).replace(/[^\p{L}\p{N}]/gu, '').length >= 12).length;
  const minimums = days.filter((s) => s === 'min').length;

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
    hasTimes,
  };
}
