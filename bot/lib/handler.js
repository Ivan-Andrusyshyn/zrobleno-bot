// Уся логіка бота: розбір коментарів, команди, дані для лендінгу
import { tg } from "./telegram.js";
import { store } from "./store.js";
import {
  TOTAL_DAYS, parseDay, parseStatus, parseNote, parseRegistration,
  displayName, todayYmd, dayNumber, parseDate,
} from "./parse.js";

const TIMEZONE = () => process.env.TIMEZONE || "Europe/Kiev";
// Реакція 👍 на зараховану відмітку. Вимкнути: REACT_ON_CHECKIN=0 у .env
const REACT = () => process.env.REACT_ON_CHECKIN !== "0";

export const BOT_COMMANDS = [
  { command: "status", description: "Скільки учасників і відміток" },
  { command: "hideme", description: "Сховати мене з лендінгу" },
  { command: "showme", description: "Показати мене на лендінгу" },
  { command: "help", description: "Допомога" },
];

// ---------- Дані для лендінгу ----------
async function currentDay(db, s) {
  if (s.startDate) {
    const n = dayNumber(s.startDate, todayYmd(new Date(), TIMEZONE()));
    return Math.max(0, Math.min(n, TOTAL_DAYS + 1));
  }
  return db.maxDay();
}

export async function participantsPayload() {
  const db = await store();
  const s = await db.all();
  const { people, marks } = await db.participantsWithCheckins();
  const days = new Map(people.map((p) => [p.userId, Array(TOTAL_DAYS).fill(null)]));
  const comments = new Map(people.map((p) => [p.userId, []]));
  for (const m of marks) {
    const arr = days.get(m.userId);
    if (!arr || m.day < 1 || m.day > TOTAL_DAYS) continue;
    arr[m.day - 1] = m.status;
    if (m.text) comments.get(m.userId).push({ day: m.day, status: m.status, text: m.text, at: new Date(m.updatedAt).toISOString() });
  }
  return {
    challenge: { startDate: s.startDate || null, currentDay: await currentDay(db, s), totalDays: TOTAL_DAYS },
    participants: people.map((p, i) => ({
      id: i + 1, // Telegram ID назовні не віддаємо
      name: p.name || p.tgName || "Учасник",
      habit: p.habit || "Звичка не вказана",
      minimum: p.minimum || "—",
      why: p.why || undefined,
      days: days.get(p.userId),
      comments: comments.get(p.userId).sort((a, b) => b.day - a.day),
    })),
  };
}

// ---------- Оновлення від Telegram ----------
export async function handleUpdate(u, api = tg()) {
  const db = await store();

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
    if (m.text?.startsWith("/")) await handleCommand(m, db, api);
    return;
  }

  const s = await db.all();
  if (s.groupId && String(m.chat.id) !== String(s.groupId)) return; // чужа група

  const text = m.text || m.caption || "";

  // Пост каналу автоматично зʼявився в групі → запамʼятовуємо, чи це «День N»
  if (m.is_automatic_forward) {
    const day = parseDay(text);
    await db.saveThread(m.chat.id, m.message_id, day ? "day" : "info", day);
    return;
  }

  if (!m.from || m.from.is_bot || m.sender_chat) return; // боти й пости від імені каналу

  const rootId = m.message_thread_id ?? m.reply_to_message?.message_id;
  const thread = rootId ? await db.thread(m.chat.id, rootId) : null;
  const tgName = displayName(m.from.first_name, m.from.last_name);

  // Відмітка дня
  const status = parseStatus(text);
  if (status) {
    const day = parseDay(text) ?? (thread?.kind === "day" ? thread.num : null);
    if (!day) return;
    await db.touchParticipant(m.from.id, tgName);
    await db.saveCheckin(m.from.id, day, status, parseNote(text), text.slice(0, 1000), m.message_id);
    if (u.message && REACT()) {
      await api.call("setMessageReaction", {
        chat_id: m.chat.id, message_id: m.message_id, reaction: [{ type: "emoji", emoji: "👍" }],
      }).catch(() => {});
    }
    return;
  }

  // Реєстрація під головним постом (або будь-де, якщо пост невідомий і є 3+ рядки)
  const reg = parseRegistration(text);
  if (reg && (thread?.kind === "info" || (!thread && reg.minimum))) {
    await db.touchParticipant(m.from.id, tgName);
    await db.saveProfile(m.from.id, reg);
  }
}

// ---------- Команди в особистому чаті ----------
async function handleCommand(m, db, api) {
  const [cmdRaw, ...args] = m.text.trim().split(/\s+/);
  const cmd = cmdRaw.split("@")[0].toLowerCase();
  const arg = args.join(" ");
  const s = await db.all();
  const admins = (s.admins || []).map(String);
  const isAdmin = admins.includes(String(m.from.id));
  const reply = (text) => api.send(m.chat.id, text);

  switch (cmd) {
    case "/start":
    case "/help":
      return reply(isAdmin ? HELP_ADMIN : HELP_USER);
    case "/hideme":
      await db.setHidden(m.from.id, true);
      return reply("Готово, тебе не видно на лендінгу. Відмітки все одно рахуються. Повернути: /showme");
    case "/showme":
      await db.setHidden(m.from.id, false);
      return reply("Готово, ти знову на лендінгу ✅");
    case "/admin":
      if (!process.env.ADMIN_CODE || arg !== process.env.ADMIN_CODE) return reply("Невірний код.");
      if (!isAdmin) await db.set({ admins: [...admins, String(m.from.id)] });
      return reply("Ти адмін бота ✅\n\nДалі: додай мене адміном у групу коментарів каналу, потім /status");
  }

  if (!isAdmin) return reply(HELP_USER);

  switch (cmd) {
    case "/status": {
      const day = await currentDay(db, s);
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
    default:
      return reply(HELP_ADMIN);
  }
}

const HELP_USER = `Я бот челенджу «Зроблено.» 👋
Рахую відмітки з коментарів під постами «День N».

Як відмітитися: під постом свого дня напиши
День 5 ✅ — 15 сторінок
✅ зроблено · 🟨 мінімум · ❌ пропуск

/hideme — сховати себе з лендінгу
/showme — повернути`;

const HELP_ADMIN = `Команди адміна:
/status — група, поточний день, скільки учасників і відміток
/date 10.11.2026 — задати дату старту (необовʼязково; інакше день береться з постів «День N»)
/date off — рахувати день за постами

Важливо: у тексті кожного поста дня має бути «День N».`;
