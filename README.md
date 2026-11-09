# Зроблено. — збір відміток з коментарів + лендінг учасників

Бот сидить у групі коментарів Telegram-каналу, читає відмітки під постами «День N»
(✅ зроблено · 🟨 мінімум · ❌ пропуск) і реєстрації під головним постом,
зберігає все в MongoDB, а лендінг на Angular показує кожного учасника з сіткою 30 днів і текстами відміток.

Пости в канал публікуєш сам. **У тексті кожного поста дня має бути «День N».**

## Структура

```
zrobleno-bot/
├─ bot/                    Node.js + MongoDB (під Vercel)
│  ├─ api/tg.js            вебхук Telegram          → /api/tg
│  ├─ api/participants.js  дані для лендінгу        → /api/participants
│  ├─ api/setup.js         підключити вебхук        → /api/setup?key=WEBHOOK_SECRET
│  ├─ lib/handler.js       уся логіка: коментарі, команди, дані для лендінгу
│  ├─ lib/parse.js         розпізнавання «День N», ✅🟨❌, реєстрації
│  ├─ lib/store.js         колекції MongoDB
│  ├─ lib/db.js            підключення до MongoDB
│  ├─ scripts/poll.js      локальний запуск бота без деплою
│  ├─ scripts/server.js    локальний API для лендінгу (порт 3000)
│  ├─ test/                тести (npm test)
│  └─ .env.example         зразок змінних → скопіюй у .env
└─ landing/                Angular, mobile first
```

## Колекції MongoDB

| Колекція | Що зберігає |
|---|---|
| `settings` | адміни, група коментарів, (необовʼязково) дата старту |
| `threads` | пости каналу в групі: «День N» або інформаційний |
| `participants` | учасник: імʼя, звичка, мінімум, навіщо, прихований чи ні |
| `checkins` | відмітка: людина + день (унікально), статус, повний текст коментаря |

Індекси створюються автоматично при першому запуску.

## Як бот розуміє коментарі

| Що пише учасник | Що робить бот |
|---|---|
| `День 5 ✅ — 15 сторінок` (будь-де) | відмітка ✅ за день 5 |
| `🟨 — 1 сторінка` під постом «День 5» | відмітка 🟨 за день 5 |
| кілька відміток за день | рахується остання |
| редагує свій коментар | оновлює відмітку і текст |
| 3–4 рядки під головним постом | профіль: імʼя / звичка / мінімум / навіщо |
| коментар без значка | ігнорує |

## 1. База MongoDB (безкоштовно)

1. Зареєструйся на mongodb.com/atlas → створи кластер **M0 (Free)**.
2. Database Access → створи користувача з паролем.
3. Network Access → `0.0.0.0/0` (Vercel не має фіксованих IP).
4. Connect → Drivers → скопіюй рядок `mongodb+srv://...` → у `.env` як `MONGODB_URI`.

## 2. Запуск локально (без деплою)

```powershell
cd D:\zrobleno-bot\bot
copy .env.example .env      # і заповни значення
npm install
npm test                    # перевірка логіки
npm run poll                # бот працює, поки відкрите вікно
```

У Telegram: напиши боту `/admin <ADMIN_CODE>`, додай його адміном у групу коментарів, перевір `/status`.

Лендінг з живими даними (у другому вікні):

```powershell
cd D:\zrobleno-bot\bot
npm run api                 # http://localhost:3000/api/participants
```

```powershell
cd D:\zrobleno-bot\landing
# у src\app\config.ts: API_BASE = 'http://localhost:3000'
npm install
npm start                   # http://localhost:4200
```

## 3. Деплой на Vercel (потім)

**Бот** — новий проєкт Vercel з папки `bot` (Root Directory: `bot`):
- Environment Variables: усі змінні з `.env`
- після деплою відкрий `https://<бот>.vercel.app/api/setup?key=<WEBHOOK_SECRET>` → має бути `"ok": true`
- ⚠️ `npm run poll` і вебхук не працюють одночасно: після локальних тестів обовʼязково відкрий `/api/setup` ще раз

**Лендінг** — окремий проєкт Vercel з папки `landing` (Root Directory: `landing`):
- Framework: Angular, Output Directory: `dist/landing/browser`
- перед деплоєм у `src/app/config.ts` встав адресу бота: `API_BASE = 'https://<бот>.vercel.app'`
