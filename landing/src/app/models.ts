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

export function completion(p: Participant, uptoDay: number): number {
  const n = Math.max(1, Math.min(uptoDay, p.days.length));
  const ok = p.days.slice(0, n).filter((s) => s === 'done' || s === 'min').length;
  return Math.round((ok / n) * 100);
}

/** Прибирає повтор «День 5 ✅ —» на початку коментаря (він уже є в заголовку) */
export function cleanText(text: string): string {
  const t = text
    .replace(/^\s*д[ен]{1,2}ь\s*№?\s*\d{1,2}\s*/iu, '')
    .replace(/^\s*(✅|✔️|✔|☑️|🟨|🟡|🔶|❌|✖️|✖|⛔)\s*/u, '')
    .replace(/^\s*[—–-]\s*/u, '')
    .trim();
  return t || text.trim();
}

/** 1 день, 2 дні, 5 днів */
export function daysWord(n: number): string {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return 'день';
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'дні';
  return 'днів';
}
