# Зроблено. — збір відміток з коментарів + лендінг учасників

Усе на **Cloudflare** (безкоштовно), один проєкт Pages `zrobleno` → **https://zrobleno.pages.dev**:

- **лендінг** (Angular, mobile first) — сам сайт;
- **бот** — функції цього ж сайту: `/api/tg`, `/api/participants`, `/api/setup`, `/api/health`;
- **база** — Cloudflare D1 (таблиці створюються автоматично).

Бот сидить у групі коментарів каналу, читає відмітки під постами «День N»
(✅ зроблено · 🟨 мінімум · ❌ пропуск) і реєстрації під головним постом.
**День поста:** з тексту «День N», а якщо тексту немає (банер без підпису) — за датою публікації від дати старту (`/date 10.11.2026`).

## Структура

```
landing/
├─ src/                    Angular-лендінг
├─ functions/api/          Cloudflare Pages Functions (бот)
│  ├─ tg.js                вебхук Telegram       POST /api/tg
│  ├─ participants.js      дані для лендінгу     GET  /api/participants (кеш 60 с)
│  ├─ setup.js             підключити вебхук     GET  /api/setup?key=WEBHOOK_SECRET
│  └─ health.js            перевірка налаштувань GET  /api/health
└─ server/                 логіка бота
   ├─ handler.js           коментарі, команди, дані для лендінгу
   ├─ parse.js             «День N», ✅🟨❌, реєстрація
   ├─ store.js             D1 (SQLite)
   ├─ telegram.js          Telegram Bot API
   └─ test/                тести: npm run test:bot
```

## Налаштування Cloudflare (один раз)

Проєкт Pages `zrobleno`: Root directory `landing`, Build command `npm run build`, Output `dist/landing/browser`.

1. **D1**: Storage & databases → D1 → Create → назва `zrobleno`.
2. **Привʼязка бази**: Pages `zrobleno` → Settings → Bindings → Add → D1 database → Variable name `DB` → база `zrobleno`.
3. **Секрети**: Pages `zrobleno` → Settings → Variables and Secrets → Add (тип Secret):
   `BOT_TOKEN`, `ADMIN_CODE`, `WEBHOOK_SECRET`. Необовʼязково (Text): `TIMEZONE=Europe/Kiev`, `REACT_ON_CHECKIN=1`.
4. **Redeploy**: Deployments → останній → Retry deployment (привʼязки діють з наступного деплою).
5. Перевір `https://zrobleno.pages.dev/api/health` → `"ok": true`.
6. Відкрий `https://zrobleno.pages.dev/api/setup?key=<WEBHOOK_SECRET>` → `"ok": true`.
7. Telegram: боту `/admin <ADMIN_CODE>` → додай бота **адміном у групу коментарів** → `/status`.

Кожен push у `main` автоматично оновлює сайт і бота.

## Як бот розуміє коментарі

| Що пише учасник | Що робить бот |
|---|---|
| `День 5 ✅ — 15 сторінок` (будь-де) | відмітка ✅ за день 5 |
| `🟨 — 1 сторінка` під постом «День 5» | відмітка 🟨 за день 5 |
| кілька відміток за день | рахується остання |
| редагує коментар | оновлює відмітку і текст |
| 3–4 рядки під головним постом | профіль: імʼя / звичка / мінімум / навіщо |
| коментар без значка | ігнорує |

Команди: `/status`, `/date 10.11.2026` (необовʼязково), `/week`, `/hideme`, `/showme`, `/help`.

## Тижневі підсумки

На 8, 15, 22 і 29 день о 18:00 (Київ) бот пише під постом дня підсумок минулих 7 днів: 🟩🟨⬛ по кожному, 7/7, серія 🔥, % групи, хто повернувся після пропуску. Учасники з `/hideme` у підсумок не потрапляють.

Cloudflare Pages не вміють запускати щось за розкладом, тому:
1. (бажано) Pages → Settings → Variables and Secrets → Secret `CRON_KEY` = будь-який довгий рядок → Redeploy.
2. На [cron-job.org](https://cron-job.org) (безкоштовно) створи задачу: URL `https://zrobleno.pages.dev/api/weekly?key=<CRON_KEY>`, щогодини (або щодня о 18:05 за Києвом).
   Зайві виклики нічого не роблять: публікація лише раз на тиждень. Відповідь показує причину (`сьогодні не день підсумків`, `вже опубліковано`…).

Вручну (адмін, в особистих з ботом): `/week` — перегляд підсумку тільки собі, `/week 2` — конкретний тиждень, `/week post` — опублікувати в групі зараз.
Необовʼязково: `WEEKLY_HOUR` (за замовчуванням 18), `SITE_URL`.
