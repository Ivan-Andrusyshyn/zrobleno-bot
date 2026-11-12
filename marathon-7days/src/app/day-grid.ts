import { Component, computed, input } from '@angular/core';
import { DayStatus } from './models';

/** Сітка 7 днів: один ряд × 7 колонок */
@Component({
  selector: 'app-day-grid',
  template: `
    <ol class="grid" [class.big]="big()" [attr.aria-label]="'Прогрес: ' + summary()">
      @for (s of cells(); track $index) {
        <li class="cell" [class]="s.cls" [attr.title]="'День ' + ($index + 1) + ': ' + s.label">
          @if (s.cls.startsWith('done') || s.cls.startsWith('min')) {
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10.5l3.2 3.2L15 7" /></svg>
          } @else if (s.cls.startsWith('miss')) {
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.5 6.5l7 7M13.5 6.5l-7 7" /></svg>
          } @else if (big()) {
            <span class="n">{{ $index + 1 }}</span>
          }
        </li>
      }
    </ol>
  `,
  styles: `
    .grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; max-width: 320px; }
    .grid.big { grid-template-columns: repeat(7, 1fr); gap: 8px; max-width: none; }
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
    .n { font-size: 12px; color: #6f6f6f; font-weight: 600; }
    @media (min-width: 720px) { .grid { gap: 6px; } }
  `,
})
export class DayGrid {
  days = input.required<DayStatus[]>();
  currentDay = input.required<number>();
  big = input(false);

  cells = computed(() => {
    const cur = this.currentDay();
    return this.days().map((s, i) => {
      const day = i + 1;
      let cls = s ?? (day < cur ? 'empty' : day === cur ? 'empty' : 'future');
      const label = s === 'done' ? 'зроблено' : s === 'min' ? 'мінімум — зараховано ✓' : s === 'miss' ? 'пропуск' : day <= cur ? 'без відмітки' : 'попереду';
      if (day === cur) cls += ' today';
      return { cls, label };
    });
  });

  summary = computed(() => {
    const d = this.days();
    return `${d.filter((s) => s === 'done').length} зроблено, ${d.filter((s) => s === 'min').length} мінімум, ${d.filter((s) => s === 'miss').length} пропусків`;
  });
}
