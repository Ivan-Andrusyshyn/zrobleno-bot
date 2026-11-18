import { Component, computed, input, signal } from '@angular/core';
import { DayStatus } from './models';
import { PATH } from './rewards-logic';

type Tip = { x: number; y: number; title: string; value: string; sub?: string } | null;
const ok = (s: DayStatus | undefined) => s === 'done' || s === 'min';
const ICON: Record<string, string> = { done: '✅', min: '🟨', miss: '❌' };
const TZ = 'Europe/Kiev';

/**
 * Вкладка «Графіки» на сторінці учасника: три прості графіки з тих самих відміток.
 * Один ряд даних на графік (лаймовий), без двох осей; значення — у підписах і підказках.
 */
@Component({
  selector: 'app-progress-charts',
  template: `
    <!-- 1. Зараховано днів наростаючим підсумком -->
    <section class="ch" aria-labelledby="c1">
      <div class="hd"><h3 id="c1">Зараховано днів</h3><span class="big">{{ total() }}<small> з {{ cur() }}</small></span></div>
      <p class="muted">Лінія росте з кожним ✅ чи 🟨. Пунктир — якби без жодного пропуску.</p>
      <div class="plot" (pointerleave)="tip.set(null)">
        <svg [attr.viewBox]="'0 0 ' + W + ' ' + H1" role="img" [attr.aria-label]="'Зараховано ' + total() + ' днів з ' + cur()" (pointermove)="hoverLine($event)">
          @for (g of yTicks1(); track g) {
            <line class="grid" [attr.x1]="L" [attr.x2]="W - R" [attr.y1]="y1(g)" [attr.y2]="y1(g)" />
            <text class="ax" [attr.x]="L - 6" [attr.y]="y1(g) + 3" text-anchor="end">{{ g }}</text>
          }
          @for (d of xTicks(); track d) {
            <text class="ax" [attr.x]="x(d)" [attr.y]="H1 - 4" text-anchor="middle">{{ d }}</text>
            <line class="tick" [attr.x1]="x(d)" [attr.x2]="x(d)" [attr.y1]="y1(0)" [attr.y2]="y1(0) + 4" />
          }
          <line class="axis" [attr.x1]="L" [attr.x2]="L" [attr.y1]="T - 4" [attr.y2]="y1(0)" />
          <line class="axis" [attr.x1]="L" [attr.x2]="W - R" [attr.y1]="y1(0)" [attr.y2]="y1(0)" />
          <line class="ideal" [attr.x1]="x(1)" [attr.y1]="y1(1)" [attr.x2]="x(cur())" [attr.y2]="y1(cur())" />
          <path class="area" [attr.d]="areaPath()" />
          <path class="line" [attr.d]="linePath()" />
          @for (m of milestones(); track m.at) {
            <text class="medal" [attr.x]="x(m.day)" [attr.y]="y1(m.at) - 9" text-anchor="middle">{{ m.icon }}</text>
          }
          @if (hx() !== null) {
            <line class="cross" [attr.x1]="x(hx()!)" [attr.x2]="x(hx()!)" [attr.y1]="T" [attr.y2]="H1 - B" />
            <circle class="dot" [attr.cx]="x(hx()!)" [attr.cy]="y1(cum()[hx()! - 1])" r="4.5" />
          }
          <circle class="dot" [attr.cx]="x(cur())" [attr.cy]="y1(total())" r="4.5" />
        </svg>
      </div>
    </section>

    <!-- 2. Ефективність: класичний графік — дні внизу, % збоку, одна лінія з точками -->
    <section class="ch" aria-labelledby="c4">
      <div class="hd"><h3 id="c4">Ефективність, %</h3><span class="big">{{ last() }}%</span></div>
      <p class="muted">Що вище лінія — то краще йдуть справи. ✅ = 100%, 🟨 = 50%, ❌ = 0% (середнє за 3 останні дні).</p>
      <div class="plot" (pointerleave)="tip.set(null); hx4.set(null)">
        <svg [attr.viewBox]="'0 0 ' + W + ' ' + H4" role="img" [attr.aria-label]="'Ефективність ' + last() + '%'" (pointermove)="hoverEff($event)">
          @for (g of [0, 25, 50, 75, 100]; track g) {
            <line class="grid" [attr.x1]="L" [attr.x2]="W - R" [attr.y1]="y4(g)" [attr.y2]="y4(g)" />
            <text class="ax" [attr.x]="L - 6" [attr.y]="y4(g) + 3" text-anchor="end">{{ g }}</text>
          }
          @for (d of xTicks(); track d) {
            <text class="ax" [attr.x]="x(d)" [attr.y]="H4 - 4" text-anchor="middle">{{ d }}</text>
            <line class="tick" [attr.x1]="x(d)" [attr.x2]="x(d)" [attr.y1]="y4(0)" [attr.y2]="y4(0) + 4" />
          }
          <line class="axis" [attr.x1]="L" [attr.x2]="L" [attr.y1]="T - 4" [attr.y2]="y4(0)" />
          <line class="axis" [attr.x1]="L" [attr.x2]="W - R" [attr.y1]="y4(0)" [attr.y2]="y4(0)" />
          @if (hx4() !== null) { <line class="cross" [attr.x1]="x(hx4()!)" [attr.x2]="x(hx4()!)" [attr.y1]="T" [attr.y2]="H4 - B" /> }
          <path class="eline" [attr.d]="effPath()" />
          @for (c of daily(); track c.day) {
            <rect class="mk" [attr.x]="x(c.day) - 4" [attr.y]="y4(c.p) - 4" width="8" height="8" rx="1.5"
              [attr.transform]="'rotate(45 ' + x(c.day) + ' ' + y4(c.p) + ')'" [class.on]="hx4() === c.day" />
          }
        </svg>
      </div>
      <p class="muted center">дні челенджу</p>
    </section>

    <!-- 3. По тижнях -->
    <section class="ch" aria-labelledby="c2">
      <div class="hd"><h3 id="c2">По тижнях</h3><span class="muted">зараховано днів</span></div>
      <div class="plot" (pointerleave)="tip.set(null)">
        <svg [attr.viewBox]="'0 0 ' + W + ' ' + H2" role="img" aria-label="Зараховані дні по тижнях">
          <line class="grid" [attr.x1]="L" [attr.x2]="W - R" [attr.y1]="y2(7)" [attr.y2]="y2(7)" />
          <line class="axis" [attr.x1]="L" [attr.x2]="L" [attr.y1]="T - 4" [attr.y2]="y2(0)" />
          <line class="axis" [attr.x1]="L" [attr.x2]="W - R" [attr.y1]="y2(0)" [attr.y2]="y2(0)" />
          @for (w of weeks(); track w.n; let i = $index) {
            <g class="bar" tabindex="0" (pointerenter)="hoverWeek($event, w)" (focus)="hoverWeek($event, w)" (blur)="tip.set(null)">
              <rect class="hit" [attr.x]="bx(i) - 6" [attr.y]="T" [attr.width]="bw() + 12" [attr.height]="H2 - T - B" />
              <rect class="slot" [attr.x]="bx(i)" [attr.y]="y2(w.len)" [attr.width]="bw()" [attr.height]="y2(0) - y2(w.len)" rx="4" />
              @if (w.ok > 0) { <path class="fill" [attr.d]="barPath(bx(i), y2(w.ok), bw(), y2(0) - y2(w.ok))" /> }
              <text class="val" [attr.x]="bx(i) + bw() / 2" [attr.y]="y2(w.len) - 6" text-anchor="middle">{{ w.started ? w.ok + '/' + w.elapsed : '' }}</text>
              <text class="ax" [attr.x]="bx(i) + bw() / 2" [attr.y]="H2 - 4" text-anchor="middle">{{ w.label }}</text>
            </g>
          }
        </svg>
      </div>
    </section>

    <!-- 3. Коли відмічається -->
    <section class="ch" aria-labelledby="c3">
      <div class="hd"><h3 id="c3">Коли відмічаєшся</h3><span class="muted">час першої відмітки</span></div>
      <div class="plot" (pointerleave)="tip.set(null)">
        <svg [attr.viewBox]="'0 0 ' + W + ' ' + H3" role="img" aria-label="Час відміток по днях">
          <rect class="band" [attr.x]="L" [attr.y]="y3(0)" [attr.width]="W - L - R" [attr.height]="y3(9) - y3(0)" />
          <rect class="band" [attr.x]="L" [attr.y]="y3(23)" [attr.width]="W - L - R" [attr.height]="y3(24) - y3(23)" />
          <text class="bandl" [attr.x]="W - R - 4" [attr.y]="y3(0) + 11" text-anchor="end">🌅 до 9:00</text>
          <text class="bandl" [attr.x]="W - R - 4" [attr.y]="y3(24) - 4" text-anchor="end">🦉 після 23:00</text>
          @for (h of [0, 6, 12, 18, 24]; track h) {
            <line class="grid" [attr.x1]="L" [attr.x2]="W - R" [attr.y1]="y3(h)" [attr.y2]="y3(h)" />
            <text class="ax" [attr.x]="L - 6" [attr.y]="y3(h) + 3" text-anchor="end">{{ h }}:00</text>
          }
          @for (d of xTicks(); track d) {
            <text class="ax" [attr.x]="x(d)" [attr.y]="H3 - 4" text-anchor="middle">{{ d }}</text>
            <line class="tick" [attr.x1]="x(d)" [attr.x2]="x(d)" [attr.y1]="y3(24)" [attr.y2]="y3(24) + 4" />
          }
          <line class="axis" [attr.x1]="L" [attr.x2]="L" [attr.y1]="y3(0)" [attr.y2]="y3(24)" />
          <line class="axis" [attr.x1]="L" [attr.x2]="W - R" [attr.y1]="y3(24)" [attr.y2]="y3(24)" />
          @for (t of timesData(); track t.day) {
            <g class="pt" tabindex="0" (pointerenter)="hoverTime($event, t)" (focus)="hoverTime($event, t)" (blur)="tip.set(null)">
              <circle class="hit" [attr.cx]="x(t.day)" [attr.cy]="y3(t.h)" r="12" />
              <circle class="tdot" [attr.cx]="x(t.day)" [attr.cy]="y3(t.h)" r="4.5" />
            </g>
          }
        </svg>
        @if (!timesData().length) { <p class="muted empty">Тут зʼявляться точки, щойно будуть відмітки.</p> }
      </div>
    </section>

    @if (tip(); as t) {
      <div class="tip" [style.left.px]="t.x" [style.top.px]="t.y" role="status">
        <b>{{ t.value }}</b><span>{{ t.title }}</span>@if (t.sub) {<span class="sub">{{ t.sub }}</span>}
      </div>
    }
  `,
  styles: `
    :host { display: grid; gap: 14px; position: relative; margin: 16px 0 0; }
    .ch { background: var(--card); border-radius: 20px; padding: 14px 14px 8px; }
    .hd { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
    h3 { margin: 0; font-size: 16px; font-weight: 800; }
    .big { font-size: 22px; font-weight: 800; } .big small { font-size: 13px; color: var(--muted); font-weight: 600; }
    .muted { color: var(--muted); font-size: 12px; margin: 4px 0 0; }
    .plot { position: relative; margin-top: 6px; }
    svg { display: block; width: 100%; height: auto; overflow: visible; touch-action: pan-y; }
    .grid { stroke: #262626; stroke-width: 1; }
    .ax { fill: #8a8a8a; font-size: 10px; }
    .axis { stroke: #7a7a7a; stroke-width: 1.5; stroke-linecap: square; }
    .tick { stroke: #7a7a7a; stroke-width: 1.5; }
    .ideal { stroke: #5a5a5a; stroke-width: 1.5; stroke-dasharray: 4 4; }
    .line { fill: none; stroke: var(--done); stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
    .area { fill: var(--done); opacity: .12; }
    .dot { fill: var(--done); stroke: var(--card); stroke-width: 2; }
    .cross { stroke: #8a8a8a; stroke-width: 1; }
    .medal { font-size: 11px; }
    .slot { fill: #1f1f1f; }
    .legend { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: #cfcfcf; }
    .legend li { display: flex; align-items: center; gap: 6px; }
    .k { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
    .k.done, .pd.done { background: var(--done); fill: var(--done); }
    .k.min, .pd.min { background: var(--min); fill: var(--min); }
    .k.miss, .pd.miss { background: #6a6a6a; fill: #6a6a6a; }
    .k.tl { height: 3px; border-radius: 2px; background: #fff; }
    .pd { stroke: var(--card); stroke-width: 2; }
    .tline { fill: none; stroke: #fff; stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
    .tarea { fill: #fff; opacity: .035; }
    .sum { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0; }
    .s { border-radius: 999px; padding: 4px 10px; font-size: 13px; font-weight: 700; background: #1f1f1f; }
    .trend { margin: 10px 0 0; font-size: 14px; font-weight: 700; }
    .eline { fill: none; stroke: var(--done); stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
    .mk { fill: var(--done); stroke: var(--card); stroke-width: 1.5; }
    .mk.on { fill: #fff; }
    .center { text-align: center; margin: 2px 0 6px; }
    .fill { fill: var(--done); }
    .bar:hover .fill, .bar:focus .fill { filter: brightness(1.15); }
    .bar:focus, .pt:focus { outline: none; }
    .bar:focus .slot, .pt:focus .tdot { stroke: #fff; stroke-width: 1.5; }
    .val { fill: #e6e6e6; font-size: 11px; font-weight: 700; }
    .hit { fill: transparent; }
    .band { fill: #1b1b1b; }
    .bandl { fill: #8a8a8a; font-size: 10px; }
    .tdot { fill: var(--done); stroke: var(--card); stroke-width: 2; }
    .pt:hover .tdot { stroke: #fff; }
    .empty { position: absolute; inset: 40% 0 auto; text-align: center; }
    .tip { position: absolute; transform: translate(-50%, calc(-100% - 10px)); pointer-events: none; background: #0c0c0c; border: 1px solid #333;
           border-radius: 10px; padding: 6px 10px; display: grid; gap: 1px; font-size: 12px; white-space: nowrap; z-index: 2; }
    .tip b { font-size: 14px; } .tip span { color: var(--muted); } .tip .sub { color: #cfcfcf; }
  `,
})
export class ProgressCharts {
  days = input.required<DayStatus[]>();
  stamps = input<(string | null)[] | undefined>(undefined);
  currentDay = input.required<number>();
  total30 = 30;

  // геометрія (viewBox масштабується під ширину екрана)
  readonly W = 340; readonly L = 30; readonly R = 8; readonly T = 14; readonly B = 18;
  readonly H1 = 170; readonly H2 = 140; readonly H3 = 170; readonly H4 = 180;
  tip = signal<Tip>(null);
  hx = signal<number | null>(null);

  cur = computed(() => Math.max(1, Math.min(this.currentDay(), this.total30)));
  cum = computed(() => { let n = 0; return this.days().slice(0, this.cur()).map((s) => (n += ok(s) ? 1 : 0)); });
  total = computed(() => this.cum().at(-1) ?? 0);
  span = computed(() => Math.max(this.cur(), 7));
  x = (d: number) => this.L + ((d - 1) / Math.max(this.span() - 1, 1)) * (this.W - this.L - this.R);
  xTicks = computed(() => { const s = this.span(); const step = s <= 10 ? 1 : s <= 20 ? 3 : 5; const t: number[] = []; for (let d = 1; d <= s; d += step) t.push(d); return t; });
  yMax = computed(() => Math.max(this.cur(), 5));
  y1 = (v: number) => this.T + (1 - v / this.yMax()) * (this.H1 - this.T - this.B);
  yTicks1 = computed(() => [0, Math.round(this.yMax() / 2), this.yMax()]);
  linePath = computed(() => this.cum().map((v, i) => `${i ? 'L' : 'M'}${this.x(i + 1).toFixed(1)},${this.y1(v).toFixed(1)}`).join(''));
  areaPath = computed(() => { const c = this.cum(); return c.length ? `${this.linePath()}L${this.x(c.length).toFixed(1)},${this.y1(0)}L${this.x(1).toFixed(1)},${this.y1(0)}Z` : ''; });
  /** медалі «Шляху» на лінії — у той день, коли їх отримано */
  milestones = computed(() => {
    const c = this.cum();
    return PATH.filter((m) => m.at <= this.total()).map((m) => ({ ...m, day: c.indexOf(m.at) + 1 })).filter((m) => m.day > 0);
  });

  // ---- ефективність, %: ✅ 100, 🟨 50, ❌/без відмітки 0; точка дня = середнє за останні 3 дні
  private score = (s: DayStatus | undefined): number => (s === "done" ? 100 : s === "min" ? 50 : 0);
  /** дні, що вже минули; сьогоднішній — лише якщо вже є відмітка */
  private counted = computed(() => { const d = this.days().slice(0, this.cur()); return d[d.length - 1] ? d : d.slice(0, -1); });
  daily = computed(() => {
    const v = this.counted().map((s) => this.score(s));
    return this.counted().map((s, i) => {
      const w = v.slice(Math.max(0, i - 2), i + 1);
      return { day: i + 1, s: s ?? 'miss', p: Math.round(w.reduce((a, b) => a + b, 0) / w.length) };
    });
  });
  last = computed(() => this.daily().at(-1)?.p ?? 0);
  y4 = (v: number) => this.T + (1 - v / 100) * (this.H4 - this.T - this.B);
  hx4 = signal<number | null>(null);
  effPath = computed(() => this.daily().map((c, i) => `${i ? 'L' : 'M'}${this.x(c.day).toFixed(1)},${this.y4(c.p).toFixed(1)}`).join(''));
  hoverEff(ev: PointerEvent) {
    const svg = ev.currentTarget as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const sx = ((ev.clientX - r.left) / r.width) * this.W;
    const d = Math.round(((sx - this.L) / (this.W - this.L - this.R)) * (this.span() - 1)) + 1;
    const c = this.daily()[d - 1];
    if (!c) { this.hx4.set(null); this.tip.set(null); return; }
    this.hx4.set(d);
    const p = this.place(ev, this.x(d), this.y4(c.p));
    this.tip.set({ ...p, value: `${c.p}%`, title: `День ${d}`, sub: c.s === 'done' ? '✅ максимум' : c.s === 'min' ? '🟨 мінімум' : '❌ пропуск' });
  }

  // ---- тижні
  weeks = computed(() => {
    const d = this.days(), cur = this.cur();
    const out = [] as { n: number; label: string; len: number; elapsed: number; ok: number; done: number; min: number; miss: number; none: number; started: boolean }[];
    for (let w = 0; w * 7 < this.total30; w++) {
      const from = w * 7, to = Math.min(from + 7, this.total30), len = to - from;
      const past = d.slice(from, Math.min(to, cur));
      out.push({
        n: w + 1, label: len === 7 ? `${w + 1}-й` : `${from + 1}–${to}`, len, started: cur > from, elapsed: past.length,
        ok: past.filter(ok).length, done: past.filter((s) => s === 'done').length, min: past.filter((s) => s === 'min').length,
        miss: past.filter((s) => s === 'miss').length, none: past.filter((s) => !s).length,
      });
    }
    return out;
  });
  bw = computed(() => (this.W - this.L - this.R) / this.weeks().length - 12);
  bx = (i: number) => this.L + 6 + i * (this.bw() + 12);
  y2 = (v: number) => this.T + (1 - v / 7) * (this.H2 - this.T - this.B);
  /** стовпчик з округленим лише верхом — низ стоїть на базовій лінії */
  barPath(x: number, y: number, w: number, h: number) {
    const r = Math.min(4, h, w / 2);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  // ---- час відміток
  y3 = (h: number) => this.T + (h / 24) * (this.H3 - this.T - this.B);
  timesData = computed(() => {
    const t = this.stamps() ?? [], d = this.days(), cur = this.cur();
    const fmt = new Intl.DateTimeFormat('uk-UA', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    return t.slice(0, cur).map((iso, i) => {
      if (!iso || !d[i]) return null;
      const [hh, mm] = fmt.format(new Date(iso)).split(':').map(Number);
      return { day: i + 1, h: hh + mm / 60, label: fmt.format(new Date(iso)), status: d[i] as string };
    }).filter((v): v is { day: number; h: number; label: string; status: string } => !!v);
  });

  // ---- підказки (координати — у пікселях контейнера)
  private place(ev: Event, svgX: number, svgY: number) {
    const svg = (ev.currentTarget as Element).closest('svg') as SVGSVGElement;
    const host = svg.closest('app-progress-charts') as HTMLElement;
    const r = svg.getBoundingClientRect(), hr = host.getBoundingClientRect();
    const k = r.width / this.W;
    return { x: Math.min(Math.max(r.left - hr.left + svgX * k, 70), hr.width - 70), y: r.top - hr.top + svgY * k };
  }
  hoverLine(ev: PointerEvent) {
    const svg = ev.currentTarget as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const sx = ((ev.clientX - r.left) / r.width) * this.W;
    const d = Math.round(((sx - this.L) / (this.W - this.L - this.R)) * (this.span() - 1)) + 1;
    if (d < 1 || d > this.cur()) { this.hx.set(null); this.tip.set(null); return; }
    this.hx.set(d);
    const s = this.days()[d - 1];
    const p = this.place(ev, this.x(d), this.y1(this.cum()[d - 1]));
    this.tip.set({ ...p, value: `${this.cum()[d - 1]} зараховано`, title: `День ${d}`, sub: s ? `${ICON[s]} ${s === 'done' ? 'зроблено' : s === 'min' ? 'мінімум' : 'пропуск'}` : 'без відмітки' });
  }
  hoverWeek(ev: Event, w: ReturnType<ProgressCharts['weeks']>[number]) {
    this.hx.set(null);
    const i = w.n - 1;
    const p = this.place(ev, this.bx(i) + this.bw() / 2, this.y2(w.len));
    this.tip.set(w.started
      ? { ...p, value: `${w.ok} з ${w.elapsed}`, title: (w.len === 7 ? `${w.n}-й тиждень` : `Дні ${w.label}`) + (w.elapsed < w.len ? ' · триває' : ''), sub: `✅ ${w.done} · 🟨 ${w.min} · ❌ ${w.miss}${w.none ? ` · без відмітки ${w.none}` : ''}` }
      : { ...p, value: 'ще попереду', title: w.len === 7 ? `${w.n}-й тиждень` : `Дні ${w.label}` });
  }
  hoverTime(ev: Event, t: { day: number; h: number; label: string; status: string }) {
    this.hx.set(null);
    const p = this.place(ev, this.x(t.day), this.y3(t.h));
    this.tip.set({ ...p, value: t.label, title: `День ${t.day}`, sub: `${ICON[t.status]}${t.h < 9 ? ' · 🌅 ранок' : t.h >= 23 ? ' · 🦉 сова' : ''}` });
  }
}
