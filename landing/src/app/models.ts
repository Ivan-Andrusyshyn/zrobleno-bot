export type DayStatus = 'done' | 'min' | 'miss' | null;

export interface CheckinComment {
  day: number;
  status: Exclude<DayStatus, null>;
  text: string;
  at: string; // ISO-дата останньої зміни
}

export interface Participant {
  id: number;
  name: string;
  habit: string;
  minimum: string;
  why?: string;
  /** 30 значень: статус кожного дня (null — відмітки немає) */
  days: DayStatus[];
  /** Особистий перший день у потоці (хто приєднався пізніше — % рахується від нього). Немає — 1 */
  startDay?: number;
  /** 30 значень: коли людина вперше відмітила цей день (ISO), null — немає відмітки */
  times?: (string | null)[];
  /** Повні тексти відміток, новіші зверху */
  comments?: CheckinComment[];
}

export const STATUS_ICON: Record<Exclude<DayStatus, null>, string> = { done: '✅', min: '🟨', miss: '❌' };

export interface ChallengeInfo {
  startDate: string | null; // 2026-11-10
  currentDay: number;       // 0 — ще не почався, 1..30, 31 — завершено
  totalDays: number;
}

export interface ParticipantsResponse {
  challenge: ChallengeInfo;
  participants: Participant[];
}

/** Поточна серія днів поспіль (✅ або 🟨), рахуючи від останнього дня з відміткою */
export function currentStreak(p: Participant, uptoDay: number): number {
  let streak = 0;
  for (let i = Math.min(uptoDay, p.days.length) - 1; i >= 0; i--) {
    const s = p.days[i];
    if (s === 'done' || s === 'min') streak++;
    else if (s === null && i === uptoDay - 1) continue; // сьогодні ще може відмітитись
    else break;
  }
  return streak;
}

/** % виконано — від особистого першого дня учасника (для тих, хто прийшов на старт, це 1-й день) */
export function completion(p: Participant, uptoDay: number): number {
  const from = Math.max(1, p.startDay ?? 1);
  const n = Math.max(1, Math.min(uptoDay, p.days.length) - from + 1);
  const ok = p.days.slice(from - 1, from - 1 + n).filter((s) => s === 'done' || s === 'min').length;
  return Math.round((ok / n) * 100);
}

/** «з 11-го дня» — лише для тих, хто приєднався посеред потоку */
export const lateLabel = (p: Participant) => ((p.startDay ?? 1) > 1 ? `з ${p.startDay}-го дня` : '');

/** Прибирає повтор «День 5 ✅ —» на початку коментаря (спільна з ботом функція) */
export { cleanText } from '../../shared/rewards.js';

/** 1 день, 2 дні, 5 днів */
export function daysWord(n: number): string {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return 'день';
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'дні';
  return 'днів';
}
