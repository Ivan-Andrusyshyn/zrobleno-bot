import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from './config';
import { DayStatus, Participant, ParticipantsResponse } from './models';

@Injectable({ providedIn: 'root' })
export class DataService {
  private http = inject(HttpClient);

  readonly data = signal<ParticipantsResponse | null>(null);
  readonly error = signal<string | null>(null);
  readonly isDemo = signal(false);

  readonly participants = computed(() => this.data()?.participants ?? []);
  readonly challenge = computed(() => this.data()?.challenge ?? { startDate: null, currentDay: 0, totalDays: 30 });

  async load(): Promise<void> {
    if (!API_BASE) {
      this.isDemo.set(true);
      this.data.set(demoData());
      return;
    }
    try {
      this.data.set(await firstValueFrom(this.http.get<ParticipantsResponse>(`${API_BASE}/api/participants`)));
    } catch {
      this.error.set('Не вдалося завантажити дані. Спробуй оновити сторінку.');
    }
  }

  byId(id: number): Participant | undefined {
    return this.participants().find((p) => p.id === id);
  }
}

/** Тестові дані, поки бот не збирає справжні відмітки */
function demoData(): ParticipantsResponse {
  const currentDay = 12;
  const people: [string, string, string][] = [
    ['Олена К.', 'Читання', '1 сторінка'],
    ['Андрій М.', 'Присідання', '5 присідань'],
    ['Марта Л.', 'Англійська', '2 хвилини Duolingo'],
    ['Іван А.', 'Програмування', '15 хвилин коду'],
    ['Софія Т.', 'Вода', '1 склянка зранку'],
    ['Дмитро Р.', 'Медитація', '1 хвилина дихання'],
    ['Юлія П.', 'Біг', '10 хвилин ходьби'],
    ['Максим Г.', 'Без соцмереж до 12:00', 'до 10:00'],
  ];
  const texts: Record<string, string[]> = {
    done: ['Зроблено, навіть раніше, ніж планувалося 💪', 'Пішло легко, вже входить у звичку', 'Зранку, поки всі спали', 'Зроблено плюс трохи більше'],
    min: ['Важкий день, але мінімум зроблено', 'Лише мінімум — і це теж рахується', 'Сил не було, але не пропускаю'],
    miss: ['Пропуск, захворіла дитина. Завтра повертаюсь', 'Не вийшло, але двічі поспіль не пропущу'],
  };
  const seq: DayStatus[] = ['done', 'done', 'min', 'done', 'miss', 'done', 'done', 'min', 'done', 'done', 'done', null];
  return {
    challenge: { startDate: '2026-11-10', currentDay, totalDays: 30 },
    participants: people.map(([name, habit, minimum], i) => {
      const days = Array.from({ length: 30 }, (_, d): DayStatus =>
        d >= currentDay ? null : seq[(d + i * 3) % seq.length] ?? null);
      const comments = days
        .map((s, d) => s && { day: d + 1, status: s, at: new Date(Date.UTC(2026, 10, 10 + d, 18)).toISOString(),
          text: `День ${d + 1} ${s === 'done' ? '✅' : s === 'min' ? '🟨' : '❌'} — ${texts[s][(d + i) % texts[s].length]}` })
        .filter((c): c is NonNullable<typeof c> => !!c)
        .reverse();
      return { id: i + 1, name, habit, minimum, days, comments };
    }),
  };
}
