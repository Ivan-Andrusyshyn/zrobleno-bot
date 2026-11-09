# Зроблено. — збір відміток з коментарів + лендінг учасників

Бот сидить у групі коментарів Telegram-каналу, читає відмітки під постами «День N»
(✅ зроблено · 🟨 мінімум · ❌ пропуск) і реєстрації під головним постом,
зберігає все в MongoDB, а лендінг на Angular показує кожного учасника з сіткою 30 днів і текстами відміток.

Пости в канал публікуєш сам. **У тексті кожного поста дня має бути «День N».**

Хостинг: **Vercel** (бот: Root Directory `bot`, функції в `bot/api/`) або **Netlify** (один сайт: лендінг + бот, `netlify.toml`).

На Vercel після деплою відкрий `https://<бот>.vercel.app/api/setup?key=<WEBHOOK_SECRET>` → `"ok": true`.

## Структура

```
zrobleno-bot/
├─ netlify.toml              збірка, функції, маршрути
├─ netlify/functions/
│  ├─ tg.mjs                 вебхук Telegram     → /api/tg
│  ├─ participants.mjs       дані для лендінгу   → /api/participants
│  └─ setup.mjs              підключити вебхук   → /api/setup?key=WEBHOOK_SECRET
├─ bot/
│  ├─ lib/handler.js         уся логіка: коментарі, команди, дані для лендінгу
│  ├─ lib/parse.js           розпізнавання «День N», ✅🟨❌, реєстрації
│  ├─ lib/store.js, db.js    MongoDB
│  ├─ scripts/poll.js        локальний запуск бота без деплою
│  ├─ scripts/server.js      локальний API для лендінгу (порт 3000)
│  ├─ test/                  тести (npm test)
│  └─ .env.example           зразок змінних
└─ landing/                  Angular, mobile first
```

## Колекції MongoDB (база `zrobleno`)

| Колекція | Що зберігає |
|---|---|
| `settings` | адміни, група коментарів, (необовʼязково) дата старту |
| `threads` | пости каналу в групі: «День N» або інформаційний |
| `participants` | учасник: імʼя, звичка, мінімум, навіщо, прихований чи ні |
| `checkins` | відмітка: людина + день (унікально), статус, повний текст коментаря |

## Деплой на Netlify

1. app.netlify.com → **Add new site → Import an existing project → GitHub → zrobleno-bot**.
   Налаштування збірки підтягнуться з `netlify.toml` — нічого не міняй.
2. **Environment variables** (Site configuration → Environment variables):

| Змінна | Значення |
|---|---|
| `BOT_TOKEN` | токен від @BotFather |
| `ADMIN_CODE` | код адміна бота |
| `WEBHOOK_SECRET` | довгий випадковий рядок |
| `MONGODB_URI` | рядок підключення MongoDB Atlas (з паролем) |
| `MONGODB_DB` | `zrobleno` |
| `TIMEZONE` | `Europe/Kiev` |
| `REACT_ON_CHECKIN` | `1` (бот ставить 👍 на зараховану відмітку) або `0` |

3. **Deploy**. Після деплою відкрий `https://<сайт>.netlify.app/api/setup?key=<WEBHOOK_SECRET>` → має бути `"ok": true`.
4. У Telegram: напиши боту `/admin <ADMIN_CODE>`, додай його **адміном у групу коментарів**, перевір `/status`.
5. Лендінг: `https://<сайт>.netlify.app`.

MongoDB Atlas → Network Access → має бути `0.0.0.0/0` (у Netlify немає фіксованих IP).

## Локально

```powershell
cd D:\zrobleno-bot\bot
copy .env.example .env      # заповни значення
npm install
npm test
npm run poll                # бот працює з ноутбука (вебхук на цей час вимикається;
                            # після тестів знову відкрий /api/setup на Netlify)
```
