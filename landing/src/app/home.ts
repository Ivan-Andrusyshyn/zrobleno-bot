import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from './data.service';
import { DayGrid } from './day-grid';
import { STATUS_ICON, cleanText, completion, currentStreak, daysWord } from './models';

@Component({
  selector: 'app-home',
  imports: [RouterLink, DayGrid],
  template: `
    <section class="hero">
      <p class="eyebrow">30-денний челендж звичок</p>
      <h1>Зроблено<span class="dot">.</span></h1>
      <p class="lead">Потроху, але щодня.</p>
    </section>

    <section class="stats" aria-label="Статистика">
      <div class="stat"><b>{{ dayLabel() }}</b><span>день челенджу</span></div>
      <div class="stat"><b>{{ data.participants().length }}</b><span>учасників</span></div>
      <div class="stat"><b>{{ checkedToday() }}</b><span>відмітилися сьогодні</span></div>
    </section>

    <label class="search">
      <span class="sr-only">Пошук учасника</span>
      <input type="search" placeholder="Пошук за імʼям або звичкою" [value]="q()" (input)="q.set($any($event.target).value)" />
    </label>

    @if (data.error()) { <p class="note">{{ data.error() }}</p> }

    <ul class="cards">
      @for (p of view(); track p.id) {
        <li>
          <a class="card" [routerLink]="['/p', p.id]">
            <div class="top">
              <div class="avatar" aria-hidden="true">{{ p.name.charAt(0) }}</div>
              <div class="who">
                <h2>{{ p.name }}</h2>
                <p>{{ p.habit }}</p>
              </div>
              <div class="streak" [attr.aria-label]="p.streak + ' ' + daysWord(p.streak) + ' поспіль'">
                <b>@if (p.streak > 0) {🔥 }{{ p.streak }}</b><span>{{ daysWord(p.streak) }}<br />поспіль</span>
              </div>
            </div>
            <app-day-grid [days]="p.days" [currentDay]="day()" />
            <div class="bar"><i [style.width.%]="p.pct"></i></div>
            <p class="meta">{{ p.pct }}% днів виконано · мінімум: {{ p.minimum }}</p>
            @if (p.comments?.[0]; as c) {
              <blockquote class="last">
                <span class="last-day">День {{ c.day }} {{ icon[c.status] }}</span>
                {{ clean(c.text) }}
              </blockquote>
            }
          </a>
        </li>
      } @empty {
        <li class="note">{{ q() ? 'Нікого не знайдено.' : 'Поки що немає учасників — вони зʼявляться після першої відмітки.' }}</li>
      }
    </ul>

    <ul class="legend" aria-label="Позначення">
      <li><i class="lg done"></i>зроблено</li>
      <li><i class="lg min"></i>мінімум</li>
      <li><i class="lg miss"></i>пропуск</li>
    </ul>
    @if (data.isDemo()) { <p class="note">Демо-дані. Справжні відмітки зʼявляться після підключення бота.</p> }
  `,
  styles: `
    .hero { padding: 28px 0 8px; }
    .eyebrow { margin: 0 0 6px; color: var(--accent); font-weight: 700; font-size: 13px; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 0; font-size: clamp(56px, 18vw, 120px); line-height: .95; letter-spacing: -0.04em; font-weight: 800; }
    .dot { color: var(--accent); }
    .lead { margin: 10px 0 0; color: var(--muted); font-size: 18px; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 24px 0 16px; }
    .stat { background: var(--card); border-radius: 16px; padding: 14px 12px; display: grid; gap: 2px; }
    .stat b { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; }
    .stat span { font-size: 12px; color: var(--muted); line-height: 1.25; }
    .search input { width: 100%; box-sizing: border-box; height: 48px; border-radius: 14px; border: 1px solid #2a2a2a; background: #0f0f0f; color: #fff; padding: 0 16px; font: inherit; font-size: 16px; }
    .search input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
    .cards { list-style: none; padding: 0; margin: 16px 0 0; display: grid; gap: 12px; }
    .card { display: grid; gap: 12px; padding: 16px; border-radius: 20px; background: var(--card); color: inherit; text-decoration: none; }
    .card:hover { background: #1a1a1a; }
    .card:focus-visible { outline: 2px solid var(--accent); }
    .top { display: flex; align-items: center; gap: 12px; }
    .avatar { width: 44px; height: 44px; flex: none; border-radius: 50%; background: #262626; display: grid; place-items: center; font-weight: 800; font-size: 18px; }
    .who { flex: 1; min-width: 0; }
    .who h2 { margin: 0; font-size: 17px; font-weight: 700; }
    .who p { margin: 2px 0 0; color: var(--muted); font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .streak { text-align: center; display: grid; }
    .streak b { color: var(--accent); font-size: 22px; font-weight: 800; line-height: 1; }
    .streak span { font-size: 11px; color: var(--muted); line-height: 1.2; margin-top: 2px; }
    .bar { height: 4px; border-radius: 2px; background: #262626; overflow: hidden; }
    .bar i { display: block; height: 100%; background: var(--accent); }
    .meta { margin: 0; font-size: 13px; color: var(--muted); }
    .last { margin: 0; padding: 10px 12px; border-radius: 12px; background: #0c0c0c; font-size: 14px; line-height: 1.4; color: #e6e6e6;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .last-day { color: var(--accent); font-weight: 700; font-size: 12px; margin-right: 6px; }
    .legend { list-style: none; padding: 0; margin: 20px 0 0; display: flex; gap: 18px; justify-content: center; color: var(--muted); font-size: 13px; }
    .legend li { display: flex; align-items: center; gap: 6px; }
    .lg { width: 14px; height: 14px; border-radius: 4px; display: inline-block; }
    .lg.done { background: var(--accent); }
    .lg.min { background: var(--min, #ffc83d); }
    .lg.miss { background: #3a3a3a; }
    .note { color: var(--muted); font-size: 13px; text-align: center; margin: 16px 0 0; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    @media (min-width: 720px) {
      .cards { grid-template-columns: repeat(2, 1fr); }
    }
    @media (min-width: 1080px) {
      .cards { grid-template-columns: repeat(3, 1fr); }
    }
  `,
})
export class Home {
  protected readonly daysWord = daysWord;
  data = inject(DataService);
  q = signal('');
  icon = STATUS_ICON;
  clean = cleanText;

  day = computed(() => this.data.challenge().currentDay);
  dayLabel = computed(() => {
    const d = this.day(), t = this.data.challenge().totalDays;
    return d < 1 ? 'старт скоро' : d > t ? 'фінал' : `${d}/${t}`;
  });

  checkedToday = computed(() => {
    const i = this.day() - 1;
    return i < 0 ? 0 : this.data.participants().filter((p) => p.days[i]).length;
  });

  view = computed(() => {
    const q = this.q().trim().toLowerCase();
    const d = this.day();
    return this.data.participants()
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.habit.toLowerCase().includes(q))
      .map((p) => ({ ...p, streak: currentStreak(p, d), pct: completion(p, d) }))
      .sort((a, b) => b.streak - a.streak || b.pct - a.pct);
  });
}
