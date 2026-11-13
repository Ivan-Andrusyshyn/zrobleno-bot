// Уся логіка бота: розбір коментарів, команди, дані для лендінгу
import { tg } from "./telegram.js";
import { store } from "./store.js";
import {
  TOTAL_DAYS, parseDay, parseStatus, parseNote, parseRegistration,
  displayName, todayYmd, dayNumber, parseDate,
} from "./parse.js";
import { weekSummaryText, postWeek, WEEK_DAYS } from "./weekly.js";
import { afterCheckin, seedAwards, medalsReport } from "./medals.js";

const TIMEZONE = (env) => env.TIMEZONE || "Europe/Kiev";
// Реакція 👍 на зараховану відмітку. Вимкнути: змінна REACT_ON_CHECKIN = 0
const REACT = (env) => env.REACT_ON_CHECKIN !== "0";

// Меню адміна: бачить лише він (scope = його особистий чат)
export const ADMIN_COMMANDS = [
  { command: "status", description: "Скільки учасників і відміток" },
  { command: "week", description: "Підсумок тижня (week 2 · week post)" },
  { command: "medals", description: "Медалі в чаті (medals on · off)" },
  { command: "date", description: "Дата старту челенджу" },
  { command: "hideme", description: "Сховати мене з лендінгу" },
  { command: "showme", description: "Показати мене на лендінгу" },
  { command: "help", description: "Допомога" },
];
/** Прибрати меню команд для всіх, крім адмінів (у них своє меню — scope chat) */
export const hideMenuForOthers = async (api) => {
  await api.call("deleteMyCommands", { scope: { type: "all_private_chats" } });
  await api.call("deleteMyCommands", { scope: { type: "default" } });
};
export const setAdminMenu = (api, chatId) =>
  api.call("setMyCommands", { commands: ADMIN_COMMANDS, scope: { type: "chat", chat_id: Number(chatId) } });

// ---------- Дані для лендінгу ----------
async function currentDay(db, s, env) {
  if (s.startDate) {
    const n = dayNumber(s.startDate, todayYmd(new Date(), TIMEZONE(env)));
    return Math.max(0, Math.min(n, TOTAL_DAYS + 1));
  }
  return db.maxDay();
}

export async function participantsPayload(env) {
  const db = await store(env.DB);
  const s = await db.all();
  const { people, marks } = await db.participantsWithCheckins();
  const days = new Map(people.map((p) => [p.userId, Array(TOTAL_DAYS).fill(null)]));
  const comments = new Map(people.map((p) => [p.userId, []]));
  const times = new Map(people.map((p) => [p.userId, Array(TOTAL_DAYS).fill(null)])); // час першої відмітки дня
  for (const m of marks) {
    const arr = days.get(m.userId);
    if (!arr || m.day < 1 || m.day > TOTAL_DAYS) continue;
    arr[m.day - 1] = m.status;
    times.get(m.userId)[m.day - 1] = m.firstAt ?? m.updatedAt ?? null;
    if (m.text) comments.get(m.userId).push({ day: m.day, status: m.status, text: m.text, at: m.updatedAt });
  }
  return {
    challenge: { startDate: s.startDate || null, currentDay: await currentDay(db, s, env), totalDays: TOTAL_DAYS },
    participants: people.map((p, i) => ({
      id: i + 1, // Telegram ID назовні не віддаємо
      name: p.name || p.tgName || "Учасник",
      habit: p.habit || "Звичка не вказана",
      minimum: p.minimum || "—",
      why: p.why || undefined,
      days: days.get(p.userId),
      times: times.get(p.userId),
      comments: comments.get(p.userId).sort((a, b) => b.day - a.day),
    })),
  };
}

// Запамʼятати, чому коментар не зараховано (видно в /api/health)
async function skip(db, reason, m) {
  await db.set({ lastSkip: { reason, at: new Date().toISOString(), text: (m.text || m.caption || "").slice(0, 40) } }).catch(() => {});
}

// ---------- Оновлення від Telegram ----------
export async function handleUpdate(u, env, api = tg(env.BOT_TOKEN)) {
  const db = await store(env.DB);

  // Бота зробили адміном у групі коментарів
  if (u.my_chat_member) {
    const { chat, new_chat_member } = u.my_chat_member;
    if ((chat.type === "supergroup" || chat.type === "group") && new_chat_member.status === "administrator") {
      await db.set({ groupId: String(chat.id), groupTitle: chat.title || "" });
      const s = await db.all();
      for (const id of s.admins || []) {
        await api.send(id, `✅ Мене додано адміном у групу «${chat.title}». Збираю відмітки звідти.`).catch(() => {});
      }
    }
    return;
  }

  const m = u.message || u.edited_message;
  if (!m) return;

  if (m.chat.type === "private") {
    if (m.text?.startsWith("/")) await handleCommand(m, db, api, env);
    return;
  }

  const s = await db.all();
  if (s.groupId && String(m.chat.id) !== String(s.groupId)) return skip(db, "повідомлення з іншої групи", m);

  const text = m.text || m.caption || "";

  // Пост каналу автоматично зʼявився в групі → запамʼятовуємо, чи це «День N»
  if (m.is_automatic_forward) {
    // День беремо з тексту («День 5»), а якщо тексту немає (банер без підпису) —
    // рахуємо за датою публікації від дати старту (/date)
    let day = parseDay(text);
    if (!day && s.startDate && m.date) {
      const n = dayNumber(s.startDate, todayYmd(new Date(m.date * 1000), TIMEZONE(env)));
      if (n >= 1 && n <= TOTAL_DAYS) day = n;
    }
    await db.saveThread(m.chat.id, m.message_id, day ? "day" : "info", day);
    return;
  }

  if (m.sender_chat) return skip(db, "коментар від імені каналу або анонімного адміна — автор невідомий", m);
  if (!m.from || m.from.is_bot) return;

  const rootId = m.message_thread_id ?? m.reply_to_message?.message_id;
  const thread = rootId ? await db.thread(m.chat.id, rootId) : null;
  const tgName = displayName(m.from.first_name, m.from.last_name);

  // Відмітка дня
  const status = parseStatus(text);
  if (status) {
    let day = parseDay(text) ?? (thread?.kind === "day" ? thread.num : null);
    // Запасний варіант: день за датою поста (або коментаря, якщо пост боту невідомий) від дати старту
    if (!day && s.startDate) {
      const when = thread?.created_at ? new Date(thread.created_at) : new Date(m.date * 1000);
      const n = dayNumber(s.startDate, todayYmd(when, TIMEZONE(env)));
      if (n >= 1 && n <= TOTAL_DAYS) day = n;
    }
    if (!day) return skip(db, `не вдалося визначити день (пост: ${thread?.kind ?? "невідомий"}, старт: ${s.startDate ?? "не задано"})`, m);
    await db.touchParticipant(m.from.id, tgName);
    // медалі: перед першою відміткою після запуску — тихо запамʼятати вже наявні (без «залпу»)
    await seedAwards(db, s, env).catch((e) => console.error("medals seed", e));
    await db.saveCheckin(m.from.id, day, status, parseNote(text), text.slice(0, 1000), m.message_id);
    if (u.message && REACT(env)) {
      await api.call("setMessageReaction", {
        chat_id: m.chat.id, message_id: m.message_id, reaction: [{ type: "emoji", emoji: "👍" }],
      }).catch(() => {});
    }
    // нова медаль → привітання відповіддю на коментар (якщо /medals on); помилка тут не ламає відмітку
    await afterCheckin(env, db, api, m.from.id, m.chat.id, m.message_id).catch((e) => console.error("medals", e));
    return;
  }

  // Реєстрація під головним постом (або будь-де, якщо є 3+ рядки)
  const reg = parseRegistration(text);
  if (reg && (thread?.kind === "info" || reg.minimum)) {
    await db.touchParticipant(m.from.id, tgName);
    await db.saveProfile(m.from.id, reg);
    return;
  }
  return skip(db, "немає значка ✅ / 🟨 / ❌", m);
}

// ---------- Команди в особистому чаті ----------
async function handleCommand(m, db, api, env) {
  const [cmdRaw, ...args] = m.text.trim().split(/\s+/);
  const cmd = cmdRaw.split("@")[0].toLowerCase();
  const arg = args.join(" ");
  const s = await db.all();
  const admins = (s.admins || []).map(String);
  const isAdmin = admins.includes(String(m.from.id));
  const reply = (text, extra) => api.send(m.chat.id, text, extra);

  // В особистих бот працює ЛИШЕ з адміном. Усім іншим — повна тиша (жодних відповідей),
  // єдиний виняток — /admin з правильним кодом. Відмітки в групі коментарів це не зачіпає.
  if (!isAdmin) {
    if (cmd !== "/admin" || !env.ADMIN_CODE || arg !== env.ADMIN_CODE) return;
  }

  switch (cmd) {
    case "/start":
    case "/help":
      return reply(HELP_ADMIN);
    case "/hideme":
      await db.setHidden(m.from.id, true);
      return reply("Готово, тебе не видно на лендінгу. Відмітки все одно рахуються. Повернути: /showme");
    case "/showme":
      await db.setHidden(m.from.id, false);
      return reply("Готово, ти знову на лендінгу ✅");
    case "/admin":
      if (!env.ADMIN_CODE || arg !== env.ADMIN_CODE) return reply("Невірний код."); // сюди доходить лише адмін
      if (!isAdmin) await db.set({ admins: [...admins, String(m.from.id)] });
      await setAdminMenu(api, m.chat.id).catch(() => {});
      await hideMenuForOthers(api).catch(() => {});
      return reply("Ти адмін бота ✅\n\nДалі: додай мене адміном у групу коментарів каналу, потім /status");
  }


  switch (cmd) {
    case "/status": {
      const day = await currentDay(db, s, env);
      const c = await db.counts(day);
      return reply([
        `Група коментарів: ${s.groupId ? (s.groupTitle || s.groupId) + " ✅" : "не підключено ❌ (додай мене адміном)"}`,
        `Поточний день: ${day || "—"}${s.startDate ? ` (старт ${s.startDate})` : " (за останнім постом «День N»)"}`,
        `Постів «День N» побачено: ${c.dayPosts}`,
        `Учасників: ${c.participants}`,
        `Відміток за сьогодні: ${c.today}`,
      ].join("\n"));
    }
    case "/date": {
      if (arg === "off") { await db.set({ startDate: null }); return reply("Поточний день рахую за останнім постом «День N»."); }
      const ymd = parseDate(arg);
      if (!ymd) return reply("Формат: /date 10.11.2026 (або /date off — рахувати за постами)");
      await db.set({ startDate: ymd });
      return reply(`Старт: ${ymd}. Поточний день на лендінгу рахую від цієї дати.`);
    }
    case "/week": {
      // /week — показати мені підсумок останнього завершеного тижня; /week 2 — конкретного;
      // /week post — опублікувати в групі зараз (не чекаючи 18:00)
      const day = await currentDay(db, s, env);
      const post = args[0] === "post";
      const n = Number(post ? args[1] : args[0]);
      const week = n >= 1 && n <= Math.floor(TOTAL_DAYS / WEEK_DAYS) ? n : Math.max(1, Math.floor((day - 1) / WEEK_DAYS));
      if (post) {
        const r = await postWeek(env, db, s, week, Math.min(day, TOTAL_DAYS) || null, api);
        if (r.posted) await db.claimWeek(week);
        return reply(r.posted ? `Опубліковано підсумок ${week}-го тижня ✅${r.underDayPost ? "" : " (поста дня не знайшов — написав просто в групу)"}` : `Не опубліковано: ${r.reason}`);
      }
      const text = weekSummaryText(await db.participantsWithCheckins(), week, env.SITE_URL || "https://zrobleno.pages.dev");
      return reply(text ? `Попередній перегляд (у групу не відправлено):\n\n${text}` : "Поки немає учасників з відмітками.", { link_preview_options: { is_disabled: true } });
    }
    case "/medals": {
      // /medals — хто що має і що чекає підсумку (тільки тобі); /medals on | off — вітати в чаті
      if (args[0] === "on" || args[0] === "off") {
        await seedAwards(db, s, env); // щоб після ввімкнення не було «залпу» за минулі дні
        await db.set({ medalsInChat: args[0] === "on" });
        return reply(args[0] === "on"
          ? "Медалі в чаті увімкнено ✅\nНові медалі «Шляху», 🪶 Фенікс і 📆 7 з 7 — одразу відповіддю на коментар; інші — у тижневому підсумку."
          : "Медалі в чаті вимкнено ⏸ (на сайті нагороди лишаються).");
      }
      return reply(await medalsReport(db, await db.all(), env));
    }
    default:
      return reply(HELP_ADMIN);
  }
}

const HELP_ADMIN = `Команди адміна:
/status — група, поточний день, скільки учасників і відміток
/date 10.11.2026 — дата старту: тоді пости дня можна публікувати без тексту «День N» (день рахується за датою)
/date off — рахувати день за постами
/week — підсумок останнього тижня (тільки тобі, для перевірки)
/week 2 — підсумок 2-го тижня
/week post — опублікувати підсумок у групі зараз
/medals — хто які медалі має (тільки тобі)
/medals on · /medals off — вітати з новими медалями в чаті

Підсумки тижня бот сам публікує на 8, 15, 22 і 29 день з першим коментарем після 18:00, під постом дня.

Якщо дату старту не задано, у тексті кожного поста дня має бути «День N».`;
