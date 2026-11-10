import { Component } from '@angular/core';

/** Коротко: як зарахувати день. Згорнуто за замовчуванням — хто хоче, розгортає. */
@Component({
  selector: 'app-rules',
  template: `
    <details class="rules">
      <summary>
        <span class="q">Як зарахувати день?</span>
        <span class="hint" aria-hidden="true">✅ 🟨 ❌</span>
        <span class="chev" aria-hidden="true"></span>
      </summary>

      <div class="body">
      <ol class="steps">
        <li>
          <span class="num">1</span>
          <div>
            <b>Знайди пост «День N» у каналі</b>
            <p>Щоранку виходить новий. Відмічайся під постом свого дня.</p>
          </div>
        </li>
        <li>
          <span class="num">2</span>
          <div>
            <b>Почни коментар з емодзі</b>
            <p>Саме емодзі вирішує, як зарахується день:</p>
            <ul class="marks">
              <li><i class="sq done"><svg viewBox="0 0 20 20"><path d="M5 10.5l3.2 3.2L15 7" /></svg></i>
                <span><b>✅ Зроблено</b><small>звичка виконана повністю</small></span></li>
              <li><i class="sq min"><svg viewBox="0 0 20 20"><path d="M5 10.5l3.2 3.2L15 7" /></svg></i>
                <span><b>🟨 Мінімум</b><small>важкий день, але зроблено мінімум — теж зараховується</small></span></li>
              <li><i class="sq miss"><svg viewBox="0 0 20 20"><path d="M6.5 6.5l7 7M13.5 6.5l-7 7" /></svg></i>
                <span><b>❌ Пропуск</b><small>не вийшло — чесно відмічаєш і повертаєшся завтра</small></span></li>
            </ul>
          </div>
        </li>
        <li>
          <span class="num">3</span>
          <div>
            <b>Далі — будь-який текст</b>
            <p>Що зробив, як пройшло, що завгодно. Або взагалі без тексту.</p>
          </div>
        </li>
      </ol>

      <div class="side">
      <figure class="example" aria-label="Приклад">
        <figcaption>Приклад</figcaption>
        <div class="post">День 5</div>
        <div class="bubble">
          <span class="author">Олена</span>
          🟨 тільки 1 сторінка, важкий день
          <span class="like" aria-hidden="true">👍</span>
        </div>
        <div class="result">
          <i class="sq min big"><svg viewBox="0 0 20 20"><path d="M5 10.5l3.2 3.2L15 7" /></svg></i>
          <span><b>День 5 зараховано</b><small>жовта клітинка, серія не обривається</small></span>
        </div>
      </figure>

      <ul class="fine">
        <li><b>👍 під коментарем</b> — відмітку прийнято. На сайті зʼявиться протягом хвилини.</li>
        <li><b>Без емодзі</b> коментар не рахується — це просто розмова.</li>
        <li><b>Одна відмітка на день.</b> Передумав — відредагуй коментар, рахується остання.</li>
        <li><b>Мінімум = повноцінний день.</b> Головне правило — не пропускати двічі поспіль.</li>
      </ul>
      </div>
      </div>
    </details>
  `,
  styles: `
    .rules { background: var(--card); border-radius: 20px; padding: 4px 16px; margin: 0 0 16px; }
    summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 10px; padding: 14px 0; }
    summary::-webkit-details-marker { display: none; }
    summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 8px; }
    .q { flex: 1; font-weight: 800; font-size: 18px; letter-spacing: -0.01em; }
    .hint { font-size: 13px; letter-spacing: 2px; opacity: .85; }
    .chev { width: 10px; height: 10px; border-right: 2px solid var(--muted); border-bottom: 2px solid var(--muted); transform: rotate(45deg); margin: -4px 4px 0 0; transition: transform .2s; }
    details[open] .chev { transform: rotate(225deg); margin-top: 4px; }

    .steps { list-style: none; padding: 0; margin: 2px 0 16px; display: grid; gap: 14px; }
    .steps > li { display: flex; gap: 12px; align-items: flex-start; }
    .num { flex: none; width: 26px; height: 26px; border-radius: 50%; background: var(--accent); color: #000; font-weight: 800; font-size: 14px; display: grid; place-items: center; }
    .steps b { font-size: 15px; font-weight: 700; }
    .steps p { margin: 3px 0 0; color: var(--muted); font-size: 14px; line-height: 1.4; }

    .marks { list-style: none; padding: 0; margin: 10px 0 0; display: grid; gap: 8px; }
    .marks li, .result { display: flex; align-items: center; gap: 10px; background: #0c0c0c; border-radius: 12px; padding: 8px 10px; }
    .marks span, .result span { display: grid; gap: 1px; }
    .marks b { font-size: 14px; }
    .marks small, .result small { color: var(--muted); font-size: 12.5px; line-height: 1.3; }

    .sq { flex: none; width: 28px; height: 28px; border-radius: 7px; display: grid; place-items: center; }
    .sq svg { width: 70%; height: 70%; fill: none; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
    .sq.done { background: var(--accent); } .sq.done svg { stroke: #000; }
    .sq.min { background: var(--min, #ffc83d); } .sq.min svg { stroke: #000; }
    .sq.miss { background: #262626; } .sq.miss svg { stroke: #8a8a8a; }
    .sq.big { width: 36px; height: 36px; border-radius: 9px; }

    .example { margin: 0 0 16px; padding: 12px; border-radius: 16px; border: 1px dashed #2e2e2e; display: grid; gap: 8px; }
    figcaption { color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    .post { justify-self: start; background: #1f1f1f; border-radius: 10px; padding: 6px 10px; font-weight: 700; font-size: 13px; }
    .post::before { content: '📌 '; }
    .bubble { position: relative; justify-self: start; max-width: 92%; background: #232323; border-radius: 4px 14px 14px 14px; padding: 8px 12px 10px; font-size: 14px; line-height: 1.35; margin-left: 14px; }
    .author { display: block; color: var(--accent); font-weight: 700; font-size: 12px; margin-bottom: 2px; }
    .like { position: absolute; right: -10px; bottom: -10px; background: #2d2d2d; border-radius: 999px; padding: 2px 6px; font-size: 12px; box-shadow: 0 0 0 2px var(--card); }
    .result { margin-top: 6px; background: transparent; padding: 0; }
    .result b { font-size: 14px; }

    .fine { list-style: none; padding: 0; margin: 0 0 16px; display: grid; gap: 8px; font-size: 13.5px; color: var(--muted); line-height: 1.4; }
    .fine b { color: #fff; font-weight: 600; }
    @media (min-width: 720px) {
      .rules { padding: 4px 20px; }
      .body { display: grid; grid-template-columns: 1.15fr 1fr; gap: 24px; align-items: start; }
      .side { padding-top: 2px; }
    }
  `,
})
export class Rules {}
