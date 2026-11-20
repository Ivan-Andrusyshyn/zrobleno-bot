import { Component, computed, input, signal } from '@angular/core';
import { Participant } from './models';

type Tip = { x: number; y: number; title: string; value: string; sub?: string } | null;

/**
 * «Продуктивність групи» на головній (плитка під статистикою, по тапу — графік по днях): середня ефективність усієї групи по днях.
 * Рахується з тих самих відміток, що приходять на сайт: ✅ 100, 🟨 50, ❌ / без відмітки 0.
 * Кожен учасник рахується з його першого дня (хто прийшов пізніше — не тягне вниз дні до приходу).
 * Сьогоднішній день не показується, поки він триває (люди ще відмічаються).
 */
@Component({
  selector: 'app-group-progress',
  template: `
    <section class="ch" aria-labelledby="gp">
      <div class="hd"><h2 id="gp">Продуктивність групи</h2><span class="big">{{ total() }}%</span></div>
      @if (points().length) {
        <div class="bar" role="img" [attr.aria-label]="'Виконано ' + share().done + '%, мінімум ' + share().min + '%, пропуски ' + share().miss + '%'">
          @if (share().done) { <i class="b-done" [style.flex-grow]="share().done"></i> }
          @if (share().min) { <i class="b-min" [style.flex-grow]="share().min"></i> }
          @if (share().miss) { <i class="b-miss" [style.flex-grow]="share().miss"></i> }
        </div>
        <div class="leg">
          <span>✅ {{ share().done }}% · 🟨 {{ share().min }}% · ❌ {{ share().miss }}%</span>
          <button type="button" class="more" (click)="open.set(!open())" [attr.aria-expanded]="open()">{{ open() ? 'Сховати' : 'По днях ›' }}</button>
        </div>
      } @else {
        <p class="muted empty">Зʼявиться після першого завершеного дня.</p>
      }
      @if (open() && points().length) {
        <p class="muted">Середня ефективність групи по днях: ✅ = 100%, 🟨 = 50%, ❌ = 0%.</p>
        <div class="plot" (pointerleave)="tip.set(null); hx.set(null)">
          <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" role="img" [attr.aria-label]="'Продуктивність групи по днях' + '%'" (pointermove)="hover($event)">
            @for (g of [0, 25, 50, 75, 100]; track g) {
              <line class="grid" [attr.x1]="L" [attr.x2]="W - R" [attr.y1]="y(g)" [attr.y2]="y(g)" />
              <text class="ax" [attr.x]="L - 6" [attr.y]="y(g) + 3" text-anchor="end">{{ g }}</text>
            }
            @for (d of ticks(); track d) {
              <text class="ax" [attr.x]="x(d)" [attr.y]="H - 4" text-anchor="middle">{{ d }}</text>
              <line class="tick" [attr.x1]="x(d)" [attr.x2]="x(d)" [attr.y1]="y(0)" [attr.y2]="y(0) + 4" />
            }
            <line class="axis" [attr.x1]="L" [attr.x2]="L" [attr.y1]="T - 4" [attr.y2]="y(0)" />
            <line class="axis" [attr.x1]="L" [attr.x2]="W - R" [attr.y1]="y(0)" [attr.y2]="y(0)" />
            @if (hx() !== null) { <line class="cross" [attr.x1]="x(hx()!)" [attr.x2]="x(hx()!)" [attr.y1]="T" [attr.y2]="y(0)" /> }
            <path class="area" [attr.d]="area()" />
            <path class="line" [attr.d]="line()" />
            @for (p of points(); track p.day) {
              <rect class="mk" [class.on]="hx() === p.day" [attr.x]="x(p.day) - 4" [attr.y]="y(p.v) - 4" width="8" height="8" rx="1.5"
                [attr.transform]="'rotate(45 ' + x(p.day) + ' ' + y(p.v) + ')'" />
            }
          </svg>
          @if (tip(); as t) {
            <div class="tip" [style.left.px]="t.x" [style.top.px]="t.y" role="status"><b>{{ t.value }}</b><span>{{ t.title }}</span>@if (t.sub) {<span class="sub">{{ t.sub }}</span>}</div>
          }
        </div>
        <p class="muted center">дні потоку</p>
      }
    </section>
  `,
  styles: `
    :host { display: block; }
    .ch { background: var(--card); border-radius: 16px; padding: 14px 12px; }
    .bar { display: flex; gap: 2px; height: 12px; margin-top: 10px; }
    .bar i { display: block; flex-basis: 0; min-width: 4px; border-radius: 4px; }
    .b-done { background: var(--done); } .b-min { background: var(--min); } .b-miss { background: #333; }
    .leg { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 8px; font-size: 13px; color: #cfcfcf; }
    .more { background: none; border: 0; color: var(--muted); font: inherit; font-size: 13px; padding: 6px 0 6px 8px; cursor: pointer; white-space: nowrap; }
    .hd { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
    h2 { margin: 0; font-size: 18px; font-weight: 800; }
    .big { font-size: 26px; font-weight: 800; color: var(--done); }
    .muted { color: var(--muted); font-size: 12px; margin: 4px 0 0; }
    .center { text-align: center; margin: 2px 0 6px; }
    .empty { margin: 8px 0 0; }
    .plot { position: relative; margin-top: 8px; }
    svg { display: block; width: 100%; height: auto; overflow: visible; touch-action: pan-y; }
    .grid { stroke: #262626; stroke-width: 1; }
    .ax { fill: #8a8a8a; font-size: 10px; }
    .axis, .tick { stroke: #7a7a7a; stroke-width: 1.5; stroke-linecap: square; }
    .cross { stroke: #8a8a8a; stroke-width: 1; }
    .line { fill: none; stroke: var(--done); stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
    .area { fill: var(--done); opacity: .1; }
    .mk { fill: var(--done); stroke: var(--card); stroke-width: 1.5; }
    .mk.on { fill: #fff; }
    .tip { position: absolute; transform: translate(-50%, calc(-100% - 10px)); pointer-events: none; background: #0c0c0c; border: 1px solid #333;
           border-radius: 10px; padding: 6px 10px; display: grid; gap: 1px; font-size: 12px; white-space: nowrap; z-index: 2; }
    .tip b { font-size: 14px; } .tip span { color: var(--muted); } .tip .sub { color: #cfcfcf; }
  `,
})
export class GroupProgress {
  participants = input.required<Participant[]>();
  currentDay = input.required<number>();
  totalDays = input(30);

  readonly W = 340; readonly H = 180; readonly L = 30; readonly R = 8; readonly T = 14; readonly B = 18;
  tip = signal<Tip>(null);
  hx = signal<number | null>(null);
  open = signal(false);

  /** завершені дні: до вчора включно (сьогодні люди ще відмічаються) */
  lastDay = computed(() => Math.min(this.currentDay() - 1, this.totalDays()));
  span = computed(() => Math.max(this.lastDay(), 7));

  points = computed(() => {
    const out: { day: number; v: number; done: number; min: number; miss: number; people: number }[] = [];
    for (let d = 1; d <= this.lastDay(); d++) {
      let sum = 0, people = 0, done = 0, min = 0, miss = 0;
      for (const p of this.participants()) {
        if ((p.startDay ?? 1) > d) continue; // ще не був у потоці
        const s = p.days[d - 1];
        people++;
        if (s === 'done') { sum += 100; done++; } else if (s === 'min') { sum += 50; min++; } else miss++;
      }
      if (people) out.push({ day: d, v: Math.round(sum / people), done, min, miss, people });
    }
    return out;
  });
  total = computed(() => {
    const p = this.points();
    const days = p.reduce((a, q) => a + q.people, 0);
    return days ? Math.round(p.reduce((a, q) => a + q.v * q.people, 0) / days) : 0;
  });

  /** частки всіх «людино-днів»: скільки ✅ / 🟨 / ❌ (сума = 100) */
  share = computed(() => {
    let done = 0, min = 0, all = 0;
    for (const p of this.points()) { done += p.done; min += p.min; all += p.people; }
    if (!all) return { done: 0, min: 0, miss: 0 };
    const d = Math.round((done / all) * 100), m = Math.round((min / all) * 100);
    return { done: d, min: m, miss: Math.max(0, 100 - d - m) };
  });

  x = (d: number) => this.L + ((d - 1) / Math.max(this.span() - 1, 1)) * (this.W - this.L - this.R);
  y = (v: number) => this.T + (1 - v / 100) * (this.H - this.T - this.B);
  ticks = computed(() => { const s = this.span(); const step = s <= 10 ? 1 : s <= 20 ? 3 : 5; const t: number[] = []; for (let d = 1; d <= s; d += step) t.push(d); return t; });
  line = computed(() => this.points().map((p, i) => `${i ? 'L' : 'M'}${this.x(p.day).toFixed(1)},${this.y(p.v).toFixed(1)}`).join(''));
  area = computed(() => { const p = this.points(); return p.length > 1 ? `${this.line()}L${this.x(p[p.length - 1].day).toFixed(1)},${this.y(0)}L${this.x(p[0].day).toFixed(1)},${this.y(0)}Z` : ''; });

  hover(ev: PointerEvent) {
    const svg = ev.currentTarget as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const sx = ((ev.clientX - r.left) / r.width) * this.W;
    const d = Math.round(((sx - this.L) / (this.W - this.L - this.R)) * (this.span() - 1)) + 1;
    const p = this.points().find((q) => q.day === d);
    if (!p) { this.hx.set(null); this.tip.set(null); return; }
    this.hx.set(d);
    const plot = svg.parentElement as HTMLElement;
    const pr = plot.getBoundingClientRect();
    const k = r.width / this.W;
    const left = Math.min(Math.max(r.left - pr.left + this.x(d) * k, 80), pr.width - 80);
    this.tip.set({ x: left, y: r.top - pr.top + this.y(p.v) * k, value: `${p.v}%`, title: `День ${d} · ${p.people} ${p.people === 1 ? 'учасник' : p.people < 5 ? 'учасники' : 'учасників'}`, sub: `✅ ${p.done} · 🟨 ${p.min} · ❌ ${p.miss}` });
  }
}
