import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from './data.service';
import { DayGrid } from './day-grid';
import { STATUS_ICON, cleanText, completion, currentStreak, daysWord } from './models';

@Component({
  selector: 'app-participant',
  imports: [RouterLink, DayGrid],
  template: `
    <a class="back" routerLink="/">← Усі учасники</a>
    @if (p(); as p) {
      <header>
        <div class="avatar" aria-hidden="true">{{ p.name.charAt(0) }}</div>
        <h1>{{ p.name }}</h1>
        <p class="habit">{{ p.habit }}</p>
      </header>

      <section class="stats">
        <div class="stat"><b>@if (streak() > 0) {🔥 }{{ streak() }}</b><span>{{ daysWord(streak()) }} поспіль</span></div>
        <div class="stat"><b>{{ pct() }}%</b><span>виконано</span></div>
        <div class="stat"><b>{{ count('done') }}/{{ count('min') }}/{{ count('miss') }}</b><span>✅ / 🟨 / ❌</span></div>
      </section>

      <app-day-grid [days]="p.days" [currentDay]="day()" [big]="true" />

      <section class="comments" aria-labelledby="c-title">
        <h2 id="c-title">Відмітки</h2>
        @for (c of p.comments ?? []; track c.day) {
          <article class="comment" [class]="c.status">
            <header class="c-head">
              <span class="c-day">День {{ c.day }}</span>
              <span class="c-icon" aria-hidden="true">{{ icon[c.status] }}</span>
              <time class="c-at" [attr.datetime]="c.at">{{ fmt(c.at) }}</time>
            </header>
            <p class="c-text">{{ clean(c.text) }}</p>
          </article>
        } @empty {
          <p class="note">Поки що немає відміток.</p>
        }
      </section>

      <dl class="info">
        <dt>Мінімум</dt><dd>{{ p.minimum }}</dd>
        @if (p.why) { <dt>Навіщо</dt><dd>{{ p.why }}</dd> }
      </dl>
    } @else {
      <p class="note">Учасника не знайдено.</p>
    }
  `,
  styles: `
    .back { display: inline-block; margin: 20px 0 8px; color: var(--muted); text-decoration: none; font-size: 15px; padding: 8px 0; }
    .back:hover { color: #fff; }
    header { text-align: center; padding: 8px 0 20px; }
    .avatar { width: 72px; height: 72px; margin: 0 auto 12px; border-radius: 50%; background: var(--accent); color: #000; display: grid; place-items: center; font-weight: 800; font-size: 30px; }
    h1 { margin: 0; font-size: 34px; font-weight: 800; letter-spacing: -0.02em; }
    .habit { margin: 6px 0 0; color: var(--muted); font-size: 17px; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 20px; }
    .stat { background: var(--card); border-radius: 16px; padding: 14px 12px; display: grid; gap: 2px; text-align: center; }
    .stat b { font-size: 22px; font-weight: 800; }
    .stat span { font-size: 12px; color: var(--muted); }
    .info { margin: 24px 0 0; display: grid; gap: 4px; background: var(--card); border-radius: 16px; padding: 16px; }
    dt { color: var(--muted); font-size: 13px; }
    dd { margin: 0 0 10px; font-size: 16px; }
    .note { color: var(--muted); text-align: center; }
    .comments { margin-top: 24px; display: grid; gap: 10px; }
    .comments h2 { margin: 0 0 4px; font-size: 20px; font-weight: 800; }
    .comment { background: var(--card); border-radius: 16px; padding: 14px 16px; border-left: 0; position: relative; }
    .comment::before { content: ''; position: absolute; left: 0; top: 14px; bottom: 14px; width: 3px; border-radius: 2px; background: var(--accent); }
    .comment.min::before { background: linear-gradient(var(--accent) 50%, #3a1d10 50%); }
    .comment.miss::before { background: #3a3a3a; }
    .c-head { display: flex; align-items: center; gap: 8px; text-align: left; padding: 0; }
    .c-day { font-weight: 700; font-size: 14px; }
    .c-icon { font-size: 14px; }
    .c-at { margin-left: auto; color: var(--muted); font-size: 12px; }
    .c-text { margin: 6px 0 0; font-size: 15px; line-height: 1.45; white-space: pre-line; word-break: break-word; }
    :host { display: block; max-width: 560px; margin: 0 auto; }
  `,
})
export class ParticipantPage {
  protected readonly daysWord = daysWord;
  private data = inject(DataService);
  id = input.required<string>();

  day = computed(() => this.data.challenge().currentDay);
  p = computed(() => this.data.byId(Number(this.id())));
  streak = computed(() => (this.p() ? currentStreak(this.p()!, this.day()) : 0));
  pct = computed(() => (this.p() ? completion(this.p()!, this.day()) : 0));
  icon = STATUS_ICON;
  clean = cleanText;
  fmt(iso: string) {
    return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', timeZone: 'Europe/Kiev' });
  }
  count(s: 'done' | 'min' | 'miss') { return this.p()?.days.filter((d) => d === s).length ?? 0; }
}
