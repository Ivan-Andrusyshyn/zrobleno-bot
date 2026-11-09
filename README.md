# Зроблено. — збір відміток з коментарів + лендінг учасників

Усе на **Cloudflare** (безкоштовно), один проєкт Pages `zrobleno` → **https://zrobleno.pages.dev**:

- **лендінг** (Angular, mobile first) — сам сайт;
- **бот** — функції цього ж сайту: `/api/tg`, `/api/participants`, `/api/setup`, `/api/health`;
- **база** — Cloudflare D1 (таблиці створюються автоматично).

Бот сидить у групі коментарів каналу, читає відмітки під постами «День N»
(✅ зроблено · 🟨 мінімум · ❌ пропуск) і реєстрації під головним постом.
**У тексті кожного поста дня має бути «День N».**

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

Команди: `/status`, `/date 10.11.2026` (необовʼязково), `/hideme`, `/showme`, `/help`.
