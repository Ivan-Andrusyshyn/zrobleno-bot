import { Component, computed, input, signal } from '@angular/core';
import { BONUS, PATH, Rewards, Tier } from './rewards-logic';
import { daysWord } from './models';

type Pick = { icon: string; name: string; tier: Tier | 'off'; status: string; rule: string; list: 'path' | 'bonus'; index: number };

/** Блок нагород на сторінці учасника: наступна нагорода, «Шлях», бонусні, правила */
@Component({
  selector: 'app-rewards',
  template: `
    <section class="rw" aria-labelledby="rw-title">
      <div class="head">
        <h2 id="rw-title">Нагороди</h2>
        <span class="muted">{{ gotCount() }} з {{ path.length }} · бонусних {{ bonusTotal() }}</span>
      </div>

      @if (r().next; as n) {
        <div class="next">
          <span class="md off nx" aria-hidden="true">{{ n.icon }}</span>
          <div class="nx-body">
            <span class="muted">Наступна</span>
            <b>{{ n.name }}</b>
            <div class="bar"><i [style.width.%]="(r().okDays / n.at) * 100"></i></div>
            <span class="muted">{{ r().okDays }} з {{ n.at }} днів · ще {{ n.at - r().okDays }} {{ daysWord(n.at - r().okDays) }}</span>
          </div>
        </div>
      } @else {
        <div class="next done-all"><span class="md platinum" aria-hidden="true">🏆</span><b>Увесь шлях пройдено!</b></div>
      }

      @if (!all() && !gotCount() && !bonusTotal()) {
        <p class="muted empty">Поки нагород немає — перша зʼявиться після першої відмітки ✅ або 🟨.</p>
      }

      @if (all() || gotCount()) { <p class="lb">Шлях</p> }
      <ul class="medals">
        @for (m of shownPath(); track m.at; let i = $index) {
          <li [class.locked]="!m.got">
            <button type="button" class="md" [class]="m.got ? m.tier : 'off'" [class.sel]="sel()?.name === m.name"
              [attr.aria-label]="m.name + (m.got ? ', отримано' : ', ще не отримано')" (click)="pickPath(m, i)">
              {{ m.icon }}
              @if (m.isNew) { <span class="new">нова</span> }
            </button>
            <span class="nm">{{ m.short }}</span><small>{{ m.at }}</small>
          </li>
          @if (sel(); as s) { @if (s.list === 'path' && i === rowEnd(s.index, 5, shownPath().length)) { <li class="tip-row" role="status">
              <div class="tip">
                <span class="md" [class]="s.tier" aria-hidden="true">{{ s.icon }}</span>
                <div><b>{{ s.name }}</b><span class="muted st">{{ s.status }}</span><p>{{ s.rule }}</p></div>
                <button type="button" class="close" aria-label="Закрити" (click)="sel.set(null)">×</button>
              </div>
            </li> } }
        }
      </ul>

      @if (all() || bonusTotal()) { <p class="lb">Бонусні</p> }
      <ul class="medals bonus">
        @for (b of shownBonus(); track b.key; let i = $index) {
          <li [class.locked]="!r().bonus[b.key]">
            <button type="button" class="md" [class]="r().bonus[b.key] ? b.tier : 'off'" [class.sel]="sel()?.name === b.name"
              [attr.aria-label]="b.name + (r().bonus[b.key] ? ', отримано ' + r().bonus[b.key] + ' раз' : ', ще не отримано')" (click)="pickBonus(b, i)">
              {{ b.icon }}
              @if (r().bonus[b.key]) { <span class="x">×{{ r().bonus[b.key] }}</span> }
            </button>
            <span class="nm">{{ b.short }}</span>
          </li>
          @if (sel(); as s) { @if (s.list === 'bonus' && i === rowEnd(s.index, 4, shownBonus().length)) { <li class="tip-row" role="status">
              <div class="tip">
                <span class="md" [class]="s.tier" aria-hidden="true">{{ s.icon }}</span>
                <div><b>{{ s.name }}</b><span class="muted st">{{ s.status }}</span><p>{{ s.rule }}</p></div>
                <button type="button" class="close" aria-label="Закрити" (click)="sel.set(null)">×</button>
              </div>
            </li> } }
        }
      </ul>

      <button type="button" class="toggle" [attr.aria-expanded]="all()" (click)="toggleAll()">
        {{ all() ? 'Сховати неотримані' : 'Усі нагороди · ' + (path.length + bonus.length) }}
        <span class="chev" [class.up]="all()" aria-hidden="true"></span>
      </button>


      <details class="rules">
        <summary><span>Як отримати нагороди?</span><span class="chev" aria-hidden="true"></span></summary>
        <p class="muted intro">Зараховується день з ✅ або 🟨. Пропуск нічого не забирає — лише відсуває наступну нагороду. Нагороди рахуються в межах цього потоку.</p>
        <p class="lb">Шлях · за зараховані дні</p>
        <ul class="list">
          @for (m of path; track m.at) {
            <li><span class="md sm" [class]="m.tier" aria-hidden="true">{{ m.icon }}</span><span><b>{{ m.name }}</b> — {{ m.at }} {{ daysWord(m.at) }}</span></li>
          }
        </ul>
        <p class="lb">Бонусні · можна отримати кілька разів</p>
        <ul class="list">
          @for (b of bonus; track b.key) {
            <li><span class="md sm" [class]="b.tier" aria-hidden="true">{{ b.icon }}</span><span><b>{{ b.name }}</b> — {{ b.rule }}</span></li>
          }
        </ul>
        <p class="muted intro">Час відмітки — за Києвом; «Ранній птах», «Нічна сова» і «Перший у дні» рахуються, лише якщо відмітився у свій день.</p>
      </details>
    </section>
  `,
  styles: `
    .rw { background: var(--card); border-radius: 20px; padding: 16px; margin: 20px 0; }
    .head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
    h2 { margin: 0; font-size: 20px; font-weight: 800; }
    .muted { color: var(--muted); font-size: 12px; }
    .lb { margin: 16px 0 8px; color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }

    .md { width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; font-size: 21px; line-height: 1; position: relative;
          border: 0; padding: 0; cursor: pointer; font-family: inherit; flex: none; }
    .md.sm { width: 28px; height: 28px; font-size: 14px; cursor: default; }
    .bronze { background: #3a2412; box-shadow: inset 0 0 0 3px #cd7f32; }
    .silver { background: #24282e; box-shadow: inset 0 0 0 3px #c0c7d0; }
    .gold { background: #33280a; box-shadow: inset 0 0 0 3px #ffc83d; }
    .platinum { background: #0f2a30; box-shadow: inset 0 0 0 3px #8fe3f5; }
    .blue { background: #16273a; box-shadow: inset 0 0 0 3px #6ab3f3; }
    .off { background: #111; box-shadow: inset 0 0 0 1px #2a2a2a; filter: grayscale(1); opacity: .45; }
    .md.sel { outline: 2px solid #fff; outline-offset: 2px; }
    .md:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

    .next { display: flex; align-items: center; gap: 12px; margin-top: 12px; background: #0c0c0c; border-radius: 14px; padding: 12px; }
    .next .nx { opacity: 1; filter: none; box-shadow: inset 0 0 0 2px var(--done); background: #111; cursor: default; }
    .nx-body { flex: 1; display: grid; gap: 2px; }
    .nx-body b { font-size: 16px; }
    .bar { height: 6px; border-radius: 3px; background: #262626; overflow: hidden; margin: 6px 0 2px; }
    .bar i { display: block; height: 100%; background: var(--done); }
    .done-all b { font-size: 16px; }

    .medals { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px 6px; }
    .medals.bonus { grid-template-columns: repeat(4, 1fr); }
    .medals li { display: grid; justify-items: center; gap: 4px; text-align: center; }
    .nm { font-size: 11px; line-height: 1.2; }
    .medals small { color: #7a7a7a; font-size: 10px; margin-top: -2px; }
    .locked .nm { color: #5c5c5c; }
    .x { position: absolute; right: -7px; bottom: -4px; background: var(--done); color: var(--done-ink); border-radius: 999px; font-size: 11px; font-weight: 800; padding: 1px 6px; }
    .new { position: absolute; top: -8px; left: 50%; transform: translateX(-50%); background: var(--accent); color: #000; font-size: 9px; font-weight: 800; border-radius: 999px; padding: 1px 5px; }

    .medals .tip-row { grid-column: 1 / -1; display: block; text-align: left; }
    .tip { position: relative; margin-top: 2px; background: #0c0c0c; border: 1px solid #262626; border-radius: 14px; padding: 12px 36px 12px 12px; display: flex; gap: 12px; align-items: flex-start; }
    .tip .md { width: 38px; height: 38px; font-size: 17px; cursor: default; }
    .tip b { display: block; font-size: 15px; }
    .tip .st { display: block; margin: 1px 0 4px; }
    .tip p { margin: 0; font-size: 14px; line-height: 1.4; color: #e6e6e6; }
    .close { position: absolute; top: 6px; right: 8px; background: none; border: 0; color: var(--muted); font-size: 20px; cursor: pointer; padding: 4px; }

    .empty { margin: 14px 0 0; line-height: 1.45; }
    .toggle { margin: 14px auto 0; display: flex; align-items: center; gap: 8px; background: #0c0c0c; border: 1px solid #262626; color: #e6e6e6;
              border-radius: 999px; padding: 8px 16px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
    .toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .toggle .chev { margin: -3px 0 0; }
    .toggle .chev.up { transform: rotate(225deg); margin-top: 3px; }
    .rules { margin-top: 16px; border-top: 1px solid #222; }
    summary { list-style: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 14px 0 2px; font-weight: 700; }
    summary::-webkit-details-marker { display: none; }
    summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 8px; }
    .chev { width: 9px; height: 9px; border-right: 2px solid var(--muted); border-bottom: 2px solid var(--muted); transform: rotate(45deg); margin: -4px 4px 0 0; transition: transform .2s; }
    details[open] .chev { transform: rotate(225deg); margin-top: 4px; }
    .intro { margin: 10px 0 0; line-height: 1.45; font-size: 13px; }
    .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    .list li { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; line-height: 1.4; }
  `,
})
export class RewardsBlock {
  protected readonly daysWord = daysWord;
  protected readonly path = PATH;
  protected readonly bonus = BONUS;
  r = input.required<Rewards>();
  sel = signal<Pick | null>(null);
  /** false — лише отримані нагороди; true — усі, разом із сірими неотриманими */
  all = signal(false);
  shownPath = computed(() => (this.all() ? this.r().path : this.r().path.filter((m) => m.got)));
  shownBonus = computed(() => (this.all() ? this.bonus : this.bonus.filter((b) => this.r().bonus[b.key] > 0)));
  toggleAll() {
    this.all.update((v) => !v);
    this.sel.set(null); // порядок медалей змінився — картку закриваємо
  }

  gotCount = computed(() => this.r().path.filter((m) => m.got).length);
  bonusTotal = computed(() => Object.values(this.r().bonus).reduce((a, b) => a + b, 0));

  /** Індекс останньої медалі в ряду, де стоїть вибрана: картка-пояснення вставляється одразу після цього ряду */
  rowEnd(index: number, cols: number, len: number) {
    return Math.min(Math.floor(index / cols) * cols + cols - 1, len - 1);
  }

  pickPath(m: Rewards['path'][number], index: number) {
    if (this.sel()?.name === m.name) return this.sel.set(null); // повторний клік — закрити
    const left = m.at - this.r().okDays;
    this.sel.set({
      icon: m.icon, name: m.name, tier: m.got ? m.tier : 'off',
      status: m.got ? 'Отримано' : `Ще ${left} ${daysWord(left)}`,
      rule: `${m.at} ${daysWord(m.at)} з ✅ або 🟨 (не обовʼязково поспіль).`,
      list: 'path', index,
    });
  }
  pickBonus(b: (typeof BONUS)[number], index: number) {
    if (this.sel()?.name === b.name) return this.sel.set(null);
    const n = this.r().bonus[b.key];
    this.sel.set({ icon: b.icon, name: b.name, tier: n ? b.tier : 'off', status: n ? `Отримано ×${n}` : 'Ще не отримано', rule: b.rule, list: 'bonus', index });
  }
}
