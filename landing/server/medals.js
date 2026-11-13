// Медалі в чаті: після кожної відмітки бот перевіряє, чи зʼявилась нова нагорода.
// - «Шлях», Фенікс, 7 з 7 → одразу відповіддю на коментар (з особистим посиланням на сайт)
// - решта («тихі») → рядком «Нові нагороди тижня» у тижневому підсумку
// Вмикається адміном: /medals on (за замовчуванням вимкнено). Поки вимкнено, нагороди
// тихо записуються як уже оголошені — тож після ввімкнення не буде «залпу» за минулі дні.
import { awardKeys, firstOfDayCounts, rewardsOf, TIER_LABEL, BONUS } from "../shared/rewards.js";
import { TOTAL_DAYS } from "./parse.js";
import { currentDayOf } from "./weekly.js";

export const SITE = (env) => env.SITE_URL || "https://zrobleno.pages.dev";
const daysWord = (n) => {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return "день";
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return "дні";
  return "днів";
};

/** Учасники у форматі спільної логіки нагород + порядковий id сторінки на сайті (як у /api/participants) */
export async function loadForRewards(db, s, env) {
  const { people, marks } = await db.participantsWithCheckins();
  const byUser = new Map(people.map((p, i) => [p.userId, {
    id: p.userId, pageId: i + 1, name: p.name || p.tgName || "Учасник",
    days: Array(TOTAL_DAYS).fill(null), times: Array(TOTAL_DAYS).fill(null), comments: [],
  }]));
  for (const m of marks) {
    const p = byUser.get(m.userId);
    if (!p || m.day < 1 || m.day > TOTAL_DAYS) continue;
    p.days[m.day - 1] = m.status;
    p.times[m.day - 1] = m.firstAt ?? m.updatedAt ?? null;
    if (m.text) p.comments.push({ day: m.day, text: m.text });
  }
  const challenge = { startDate: s.startDate || null, currentDay: await currentDayOf(db, s, env), totalDays: TOTAL_DAYS };
  const list = [...byUser.values()];
  return { list, byUser, challenge, firsts: firstOfDayCounts(list, challenge) };
}

/** Один раз: позначити всі вже наявні нагороди як оголошені, щоб при запуску не було «залпу» */
export async function seedAwards(db, s, env) {
  if (s.awardsSeeded) return;
  const { list, challenge, firsts } = await loadForRewards(db, s, env);
  for (const p of list) await db.addAwards(p.id, awardKeys(rewardsOf(p, challenge, firsts)), true);
  await db.set({ awardsSeeded: true });
}

function medalLine(a) {
  if (a.path) return `${a.path.icon} «${a.path.name}» — ${a.path.at} ${daysWord(a.path.at)} · ${TIER_LABEL[a.path.tier]}`;
  const what = a.bonus.key === "phoenix" ? "повернення після пропуску" : a.bonus.key === "perfectWeek" ? "7 з 7 за тиждень" : a.bonus.rule;
  return `${a.bonus.icon} «${a.bonus.name}» — ${what}${a.n > 1 ? ` (×${a.n})` : ""}`;
}

/** Текст привітання з новими медалями (одне повідомлення, навіть якщо медалей кілька) */
export function medalMessage(p, newInstant, r, site) {
  const lines = [newInstant.length === 1 ? `🏅 ${p.name}, нова медаль!` : `🏅 ${p.name}, нові медалі!`, ...newInstant.map(medalLine)];
  if (r.next) {
    const left = r.next.at - r.okDays;
    lines.push("", `Наступна: ${r.next.icon} ${r.next.name} — ще ${left} ${daysWord(left)}`);
  }
  lines.push(`Усі нагороди → ${site}/p/${p.pageId}`);
  return lines.join("\n");
}

/**
 * Після збереженої відмітки: знайти нові нагороди учасника, записати їх і (якщо ввімкнено)
 * привітати відповіддю на його коментар. Повертає текст привітання або null.
 */
export async function afterCheckin(env, db, api, userId, chatId, messageId) {
  const s = await db.all();
  await seedAwards(db, s, env);
  const { byUser, challenge, firsts } = await loadForRewards(db, s, env);
  const p = byUser.get(userId);
  if (!p) return null; // схований учасник — нагороди не рахуємо
  const r = rewardsOf(p, challenge, firsts);
  const known = await db.awardKeysOf(userId);
  const fresh = awardKeys(r).filter((a) => !known.has(a.key));
  if (!fresh.length) return null;
  const on = s.medalsInChat === true;
  // «тихі» чекатимуть тижневого підсумку лише якщо ввімкнено; миттєві позначаємо як оголошені одразу
  const added = [
    ...(await db.addAwards(userId, fresh.filter((a) => a.instant), true)),
    ...(await db.addAwards(userId, fresh.filter((a) => !a.instant), !on)),
  ];
  const instant = added.filter((a) => a.instant);
  if (!on || !instant.length) return null;
  const text = medalMessage(p, instant, r, SITE(env));
  await api.send(chatId, text, {
    reply_parameters: { message_id: messageId, allow_sending_without_reply: true },
    link_preview_options: { is_disabled: true },
  });
  return text;
}

/** Рядки «Нові нагороди тижня» для тижневого підсумку */
export function quietLines(rows) {
  if (!rows.length) return [];
  const byName = new Map();
  for (const r of rows) {
    const [k, n] = r.key.split(":");
    const b = BONUS.find((x) => x.key === k);
    if (!b) continue;
    const arr = byName.get(r.name) ?? [];
    const label = `${b.icon} ${b.short}`;
    if (!arr.includes(label)) arr.push(label);
    byName.set(r.name, arr);
  }
  return ["🏅 Нові нагороди тижня:", ...[...byName].map(([name, l]) => `${name} — ${l.join(", ")}`)];
}

/** Для /medals: що в кого є і що ще не потрапило в чат */
export async function medalsReport(db, s, env) {
  const { list, challenge, firsts } = await loadForRewards(db, s, env);
  const lines = [`Медалі в чаті: ${s.medalsInChat === true ? "увімкнено ✅" : "вимкнено ⏸"} (/medals on · /medals off)`, ""];
  for (const p of list) {
    const r = rewardsOf(p, challenge, firsts);
    const path = r.path.filter((m) => m.got).map((m) => m.icon).join("") || "—";
    const bonus = BONUS.filter((b) => r.bonus[b.key]).map((b) => `${b.icon}×${r.bonus[b.key]}`).join(" ");
    lines.push(`${p.name}: ${path}${bonus ? " · " + bonus : ""}${r.next ? ` → ${r.next.icon} ще ${r.next.at - r.okDays}` : ""}`);
  }
  const pending = await db.unreportedQuiet();
  if (pending.length) lines.push("", "Чекають тижневого підсумку:", ...quietLines(pending).slice(1));
  return lines.join("\n");
}
