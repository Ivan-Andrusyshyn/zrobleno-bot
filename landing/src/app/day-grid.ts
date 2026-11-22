import { Component, computed, input } from '@angular/core';
import { DayStatus } from './models';

/** Сітка 30 днів: 6 колонок × 5 рядів (mobile first) */
@Component({
  selector: 'app-day-grid',
  template: `
    <ol class="grid" [class.big]="big()" [attr.aria-label]="'Прогрес: ' + summary()">
      @for (c of preChunks(); track $index) {
        <li class="pre-block" [style.grid-column]="'span ' + c.span" [style.grid-row]="c.rows > 1 ? 'span ' + c.rows : null" [attr.title]="preTitle()">
          @if (c.label) { <span>{{ c.label }}</span> }
        </li>
      }
      @for (s of cells(); track s.day) {
        <li class="cell" [class]="s.cls" [class.start]="s.start" [attr.title]="'День ' + s.day + ': ' + s.label + (s.start ? ' · старт' : '')">
          @if (s.start) { <i class="flag" aria-hidden="true">🚩</i> }
          @if (s.cls.startsWith('done') || s.cls.startsWith('min')) {
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10.5l3.2 3.2L15 7" /></svg>
          } @else if (s.cls.startsWith('miss')) {
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.5 6.5l7 7M13.5 6.5l-7 7" /></svg>
          } @else if (big()) {
            <span class="n">{{ s.day }}</span>
          }
        </li>
      }
    </ol>
  `,
  styles: `
    .grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(10, 1fr); grid-auto-rows: 1fr; gap: 5px; }
    .grid.big { grid-template-columns: repeat(6, 1fr); gap: 8px; }
    .cell { aspect-ratio: 1; border-radius: 6px; background: #1d1d1d; display: grid; place-items: center; position: relative; }
    .big .cell { border-radius: 10px; }
    .cell svg { width: 70%; height: 70%; fill: none; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
    .done { background: var(--done); }
    .done svg { stroke: var(--done-ink); }
    .min { background: var(--min, #ffc83d); }
    .min svg { stroke: #000; }
    .miss { background: var(--miss); }
    .miss svg { stroke: #8a8a8a; }
    .empty { background: #141414; box-shadow: inset 0 0 0 1px #2a2a2a; }
    .future { background: #0e0e0e; box-shadow: inset 0 0 0 1px #1c1c1c; }
    .today { box-shadow: 0 0 0 2px #fff; }
    .pre-block { border-radius: 6px; border: 1px dashed #2e2e2e; display: flex; align-items: center; justify-content: center;
                 min-height: 100%; color: #6f6f6f; font-size: 10px; white-space: nowrap; overflow: hidden; }
    .big .pre-block { border-radius: 10px; font-size: 13px; }
    .flag { position: absolute; top: -7px; left: -4px; font-size: 11px; font-style: normal; line-height: 1; filter: drop-shadow(0 1px 1px #000); }
    .big .flag { font-size: 16px; top: -9px; left: -6px; }
    .n { font-size: 12px; color: #6f6f6f; font-weight: 600; }
    @media (min-width: 720px) { .grid { gap: 6px; } }
  `,
})
export class DayGrid {
  days = input.required<DayStatus[]>();
  currentDay = input.required<number>();
  big = input(false);
  /** особистий перший день: клітинки до нього — «ще не в потоці», а не пропуски */
  startDay = input(1);

  /** скільки днів до приходу (лише якщо за них немає відміток — інакше показуємо як є) */
  pre = computed(() => {
    const sd = Math.max(1, this.startDay());
    return this.days().slice(0, sd - 1).some(Boolean) ? 0 : sd - 1;
  });

  /** дні до приходу — один пунктирний блок «дні 1–12 · до старту», порізаний по рядках сітки */
  preChunks = computed(() => {
    const n = this.pre(), cols = this.big() ? 6 : 10;
    const out: { span: number; rows: number; label: string }[] = [];
    const full = Math.floor(n / cols); // цілі ряди «до старту» — одним високим блоком
    if (full) out.push({ span: cols, rows: full, label: '' });
    if (n % cols) out.push({ span: n % cols, rows: 1, label: '' });
    if (out.length) {
      const best = out.reduce((a, b) => (b.span * b.rows > a.span * a.rows ? b : a));
      const range = n === 1 ? 'день 1' : `дні 1–${n}`;
      best.label = best.span >= 5 ? `${range} · до старту` : best.span >= 3 ? 'до старту' : '';
    }
    return out;
  });
  preTitle = computed(() => `Дні 1–${this.pre()}: людини ще не було в потоці — це не пропуски`);

  cells = computed(() => {
    const cur = this.currentDay(), from = this.pre();
    return this.days().slice(from).map((s, j) => {
      const day = from + j + 1;
      let cls: string = s ?? (day <= cur ? 'empty' : 'future');
      const label = s === 'done' ? 'зроблено' : s === 'min' ? 'мінімум — зараховано ✓' : s === 'miss' ? 'пропуск' : day <= cur ? 'без відмітки' : 'попереду';
      if (day === cur) cls += ' today';
      return { day, cls, label, start: from > 0 && j === 0 };
    });
  });

  summary = computed(() => {
    const d = this.days();
    return `${d.filter((s) => s === 'done').length} зроблено, ${d.filter((s) => s === 'min').length} мінімум, ${d.filter((s) => s === 'miss').length} пропусків`;
  });
}
