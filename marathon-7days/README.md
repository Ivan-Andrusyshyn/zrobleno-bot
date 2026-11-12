# «Зроблено. 7 днів» — марафон звичок (сайт + бот)

Окрема копія основного челенджу з `../landing/`, переведена на **7 днів** і **щоденні підсумки**.
Повністю незалежна: свій бот, свій проєкт Cloudflare Pages, своя база D1. Основний 30-денний челендж (`landing/`) ця папка ніяк не зачіпає.

## Чим відрізняється від `landing/`

| | `landing/` (челендж) | `marathon-7days/` (марафон) |
|---|---|---|
| Днів | 30 (`TOTAL_DAYS` у `server/parse.js`) | **7** |
| Підсумки | тижневі: дні 8/15/22/29 (`server/weekly.js`) | **щоденні**: дні 2–7 + фінал на 8-й (`server/summary.js`) |
| Команда адміна | `/week`, `/week 2`, `/week post` | **`/stats`, `/stats 3`, `/stats post`** |
| Ключ «вже опубліковано» в базі | `weekly:N` | `summary:N` |
| Сайт | сітка 10×3 / 6×5, «30-денний челендж» | сітка в один ряд 7 клітинок, «7-денний марафон» |
| Ендпойнт розкладу (необовʼязково) | `/api/weekly?key=` | `/api/summary?key=` |

Усе інше (розбір ✅🟨❌, реєстрація, `/date`, `/hideme`, дизайн, база) — те саме.

## Щоденні підсумки

- **Дні 2–7, з першим повідомленням у групі після 18:00 (Київ)** бот відповідає під постом «День N» прогресом кожного учасника **за дні 1…вчора**:
  день 3 → `🟩🟨 2/2 — Оля`, день 7 → `🟩🟨🟩🟩⬛🟩 5/6 — Оля`.
  Рахуємо до вчора, щоб пізні відмітки ввечері встигли зарахуватись.
- **День 8 — фінал** за всі 7 днів: % групи, хто без жодного пропуску, 🏆 хто пройшов усі 7 днів.
  Поста «День 8» немає, тому: якщо 8-го дня в каналі вийшов будь-який пост (напр. «Фінал марафону») — бот відповість під ним; інакше напише окремим повідомленням у групі.
- **Для фіналу обовʼязково задай дату старту** (`/date 17.11.2026`): без неї бот рахує день за останнім постом «День N» і 8-го дня не настане.
- Кожен підсумок публікується **рівно один раз**, навіть якщо коментарі прийшли одночасно.
- Бот «прокидається» лише від повідомлень у групі. Якщо 8-го дня після 18:00 ніхто нічого не написав і постів не було — фінал вийде з першим повідомленням або вручну: `/stats post 7`.
- Учасники з `/hideme` у підсумки не потрапляють. Хто ще жодного разу не відмічався — не рахується.

## Налаштування (один раз)

1. **Новий бот**: @BotFather → `/newbot` → токен. (Токен старого бота не використовувати — інакше той перестане працювати.)
2. **База D1**: Cloudflare → Storage & databases → D1 → Create → `zrobleno-7`.
3. **Pages-проєкт**: Workers & Pages → Create → Pages → Connect to Git → репозиторій `zrobleno-bot`:
   - Project name: `zrobleno-7` (сайт буде `https://zrobleno-7.pages.dev`)
   - Root directory: **`marathon-7days`**
   - Build command: `npm run build`, Output: `dist/landing/browser`
4. **Привʼязка бази**: Settings → Bindings → D1 → Variable name `DB` → база `zrobleno-7`.
5. **Секрети** (Settings → Variables and Secrets, тип Secret): `BOT_TOKEN` (новий!), `ADMIN_CODE`, `WEBHOOK_SECRET`.
   Необовʼязково: `TIMEZONE=Europe/Kiev`, `SUMMARY_HOUR` (за замовч. 18), `SITE_URL` (якщо адреса не `zrobleno-7.pages.dev`).
6. **Build watch paths** (Settings → Builds → Build watch paths → Include): `marathon-7days/*`.
   А в основному проєкті `zrobleno` — `landing/*`. Тоді push в одну папку не перезбирає інший сайт.
7. **Redeploy** → перевір `https://zrobleno-7.pages.dev/api/health` → `"ok": true`.
8. Відкрий `https://zrobleno-7.pages.dev/api/setup?key=<WEBHOOK_SECRET>` → `"ok": true`.
9. Telegram: новому боту `/admin <ADMIN_CODE>` → додай його **адміном у групу коментарів марафону** → `/date ДД.ММ.РРРР` → `/status`.

⚠️ Старого бота (`landing/`) у групу марафону **не додавати**: він переключиться на нову групу і перестане рахувати основний челендж.

## Команди

Усім: `/help`, `/hideme`, `/showme`.
Адміну: `/status`, `/date 17.11.2026`, `/date off`,
`/stats` — підсумок, який сьогодні піде в групу (тільки тобі), `/stats 3` — за дні 1–3, `/stats 7` — фінал,
`/stats post` — опублікувати зараз (після цього автоматика цей день уже не публікує).

## Код

```
marathon-7days/
├─ src/app/                Angular-сайт (як у landing/, тексти й сітка під 7 днів)
├─ functions/api/
│  ├─ tg.js                вебхук Telegram + запуск щоденного підсумку після повідомлень у групі
│  ├─ summary.js           (необовʼязково) /api/summary?key=CRON_KEY для зовнішнього розкладу
│  ├─ participants.js, setup.js, health.js — як у landing/
└─ server/
   ├─ summary.js           щоденні підсумки + фінал
   ├─ handler.js           бот (команда /stats замість /week)
   ├─ parse.js             TOTAL_DAYS = 7
   ├─ store.js             + claimSummary / unclaimSummary / latestThread
   └─ test/                npm run test:bot (summary.test.js — підсумки)
```

```bash
cd marathon-7days
npm install
npm start           # http://localhost:4200 з демо-даними (день 5 з 7)
npm run test:bot
```
