// Меню адміна з кнопками (/start): спершу потік → далі Статус · Тиждень · Медалі · Дата · Закрити.
// Працює лише для адмінів; учасникам бот в особистих не відповідає (див. handler.js).
import { TOTAL_DAYS, todayYmd, dayNumber, parseDate } from "./parse.js";
import {
  TZ, addDays, endDate, dm, streamState, overlapIn, uniqueName, streamResults, pickCurrent, FINISH_DAYS,
} from "./streams.js";
import { monthName } from "./store.js";
import { weekSummaryText, postWeek, WEEK_DAYS, currentDayOf } from "./weekly.js";
import { medalsReport, seedAwards, SITE } from "./medals.js";

const WEEKS = Math.floor(TOTAL_DAYS / WEEK_DAYS);
const btn = (text, data) => ({ text, callback_data: data });
const rows = (list, per = 2) => {
  const out = [];
  for (const b of list) {
    if (b.wide || !out.length || out[out.length - 1].length >= per || out[out.length - 1].wide) out.push(Object.assign([b], { wide: b.wide }));
    else out[out.length - 1].push(b);
  }
  return out.map((r) => r.map(({ wide, ...b }) => b));
};
const wide = (b) => ({ ...b, wide: true });
const today = (env) => todayYmd(new Date(), TZ(env));
const fmt = (ymd) => (ymd ? `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}.${ymd.slice(0, 4)}` : "—");

async function isAdmin(db, userId) {
  return ((await db.all()).admins || []).map(String).includes(String(userId));
}
const pendingKey = (uid) => `pending:${uid}`;
async function getPending(db, uid) { return (await db.all())[pendingKey(uid)] || null; }
async function setPending(db, uid, v) { await db.set({ [pendingKey(uid)]: v }); }

// ---------------------------------------------------------------- екрани
async function screenHome(db, env) {
  const list = await db.streams();
  const t = today(env);
  if (!list.length) {
    return { text: "Ще немає жодного потоку.\nДодай мене адміном у групу коментарів каналу — перший потік створиться сам.", kb: rows([wide(btn("➕ Новий потік", "n"))]) };
  }
  const order = [...list].sort((a, b) => (a.status === b.status ? b.id - a.id : a.status === "active" ? -1 : 1));
  return {
    text: "🗂 Потоки\nОбери потік:",
    kb: rows([
      ...order.map((s) => { const st = streamState(s, t); return wide(btn(`${st.icon} ${s.name} · ${s.status === "active" && s.startDate && s.startDate <= t && t <= endDate(s) ? `день ${dayNumber(s.startDate, t)}` : st.label}`, `s:${s.id}`)); }),
      wide(btn("➕ Новий потік", "n")),
    ]),
  };
}

async function streamHeader(db, st, env) {
  const t = today(env);
  const v = db.forStream(st);
  const s = await v.all();
  const day = await currentDayOf(v, s, env);
  const c = await v.counts(day);
  const state = streamState(st, t);
  return [
    `${state.icon} «${st.name}» · ${state.label}`,
    st.startDate ? `${fmt(st.startDate)} – ${fmt(endDate(st))}${st.status === "active" && day >= 1 && day <= TOTAL_DAYS ? ` · день ${day} з ${TOTAL_DAYS}` : ""}` : "дата старту не задана",
    `Група: ${st.groupTitle || (st.groupId ? st.groupId : "не підключена")}`,
    `Учасників: ${c.participants}${st.status === "active" && day >= 1 && day <= TOTAL_DAYS ? ` · сьогодні відмітились: ${c.today}` : ""}`,
  ].join("\n");
}

async function screenStream(db, id, env) {
  const st = await db.stream(id);
  if (!st) return screenHome(db, env);
  if (st.status === "closed") return screenClosed(db, st);
  let text = await streamHeader(db, st, env);
  if (!st.groupId) text += "\n\n🔌 Додай мене адміном у групу коментарів каналу цього потоку — я привʼяжу її сама.";
  return {
    text,
    kb: rows([
      btn("📊 Статус", `st:${id}`), btn("📅 Тиждень", `w:${id}`),
      btn("🏅 Медалі", `md:${id}`), btn("⚙️ Дата старту", `dt:${id}`),
      wide(btn("🏁 Закрити потік", `c:${id}`)),
      wide(btn("← Усі потоки", "h")),
    ]),
  };
}

async function screenClosed(db, st) {
  const res = await streamResults(db.forStream(st));
  const fin = res.filter((r) => r.finished);
  return {
    text: [
      `⚪ «${st.name}» · завершено`,
      st.startDate ? `${fmt(st.startDate)} – ${fmt(endDate(st))}` : "",
      `🏆 Пройшли (≥${FINISH_DAYS} днів): ${fin.length} з ${res.length}`,
      fin.length ? `\n${fin.map((r) => `${r.name} — ${r.days}/${TOTAL_DAYS}`).join("\n")}` : "",
    ].filter(Boolean).join("\n"),
    kb: rows([wide(btn("← Усі потоки", "h"))]),
  };
}

async function screenStatus(db, id, env) {
  const st = await db.stream(id);
  const v = db.forStream(st);
  const s = await v.all();
  const day = await currentDayOf(v, s, env);
  const c = await v.counts(day);
  return {
    text: [
      `📊 «${st.name}»`,
      `Група коментарів: ${st.groupId ? (st.groupTitle || st.groupId) + " ✅" : "не підключено ❌"}`,
      `Поточний день: ${day || "—"}${st.startDate ? ` (старт ${fmt(st.startDate)})` : " (за останнім постом «День N»)"}`,
      `Постів «День N» побачено: ${c.dayPosts}`,
      `Учасників: ${c.participants}`,
      `Відміток за сьогодні: ${c.today}`,
    ].join("\n"),
    kb: rows([wide(btn("← Назад", `s:${id}`))]),
  };
}

async function screenWeek(db, id, env) {
  const st = await db.stream(id);
  const v = db.forStream(st);
  const day = await currentDayOf(v, await v.all(), env);
  const last = Math.max(1, Math.min(WEEKS, Math.floor((day - 1) / WEEK_DAYS)));
  return {
    text: `📅 Тижневі підсумки «${st.name}»\nВиходять самі на 8, 15, 22 і 29 день після 18:00 під постом дня.\n\nПереглянути (лише тобі) або опублікувати зараз:`,
    kb: rows([
      ...Array.from({ length: WEEKS }, (_, i) => btn(`👁 ${i + 1}-й тиждень`, `wv:${id}:${i + 1}`)),
      wide(btn(`📤 Опублікувати ${last}-й зараз`, `wp:${id}:${last}`)),
      wide(btn("← Назад", `s:${id}`)),
    ]),
  };
}

async function screenWeekPreview(db, id, week, env) {
  const st = await db.stream(id);
  const v = db.forStream(st);
  const text = weekSummaryText(await v.participantsWithCheckins(), week, SITE(env));
  return {
    text: text ? `Попередній перегляд (у групу не відправлено):\n\n${text}` : "Поки немає учасників з відмітками.",
    kb: rows([btn("📤 Опублікувати", `wp:${id}:${week}`), btn("← Назад", `w:${id}`)]),
  };
}

async function screenMedals(db, id, env) {
  const st = await db.stream(id);
  const v = db.forStream(st);
  const s = await v.all();
  return {
    text: `🏅 «${st.name}»\n${await medalsReport(v, s, env)}`,
    kb: rows([
      wide(btn(s.medalsInChat === true ? "⏸ Вимкнути медалі в чаті" : "✅ Увімкнути медалі в чаті", `mt:${id}`)),
      wide(btn("← Назад", `s:${id}`)),
    ]),
  };
}

async function screenClose(db, id) {
  const st = await db.stream(id);
  const res = await streamResults(db.forStream(st));
  const fin = res.filter((r) => r.finished);
  return {
    text: [
      `🏁 Закрити «${st.name}»?`,
      `Пройшли (≥${FINISH_DAYS}/${TOTAL_DAYS}): ${fin.length} з ${res.length}`,
      "Результати збережуться в архіві, фінішерам +1 пройдений потік.",
      "Після закриття відмітки в цей потік більше не приймаються. Цю дію не можна скасувати.",
    ].join("\n"),
    kb: rows([
      wide(btn("✅ Закрити + фінал у групу", `cc:${id}:1`)),
      wide(btn("✅ Закрити тихо", `cc:${id}:0`)),
      wide(btn("Скасувати", `s:${id}`)),
    ]),
  };
}

export function finalMessage(st, res, site) {
  const fin = res.filter((r) => r.finished && !r.hidden);
  return [
    `🏁 Потік «${st.name}» завершено!`,
    "",
    `🏆 Пройшли: ${res.filter((r) => r.finished).length} з ${res.length}`,
    ...(fin.length ? ["", ...fin.map((r) => `${r.days === TOTAL_DAYS ? "💎" : "🏆"} ${r.name} — ${r.days}/${TOTAL_DAYS}`)] : []),
    "",
    "Дякую всім, хто був у потоці! Кожен день — уже результат 💪",
    "",
    `Статистика → ${site}`,
  ].join("\n");
}

/** Закрити потік: зберегти результати, позначити закритим, за бажанням — фінал у групу */
export async function closeStream(db, id, withFinal, api, env) {
  const st = await db.stream(id);
  if (!st || st.status === "closed") return st;
  const v = db.forStream(st);
  const res = await streamResults(v);
  await db.saveMemberResults(id, res);
  await db.updateStream(id, { status: "closed", closedAt: new Date().toISOString() });
  if (withFinal && st.groupId) {
    await api.send(st.groupId, finalMessage(st, res, SITE(env)), { link_preview_options: { is_disabled: true } }).catch(() => {});
  }
  return st;
}

// ---- новий потік: дата → група → назва → підтвердження
function nextMonday(t) { const [y, m, d] = t.split("-").map(Number); const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return addDays(t, ((8 - wd) % 7) || 7); }
function firstOfNextMonth(t) { const [y, m] = t.split("-").map(Number); return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10); }

async function screenNewDate(db, env) {
  const t = today(env);
  const cur = pickCurrent((await db.streams()).filter((s) => s.status === "active" && s.groupId), t);
  const opts = [];
  if (cur?.startDate) opts.push(wide(btn(`Одразу після «${cur.name}» · ${dm(addDays(endDate(cur), 1))}`, `nd:${addDays(endDate(cur), 1)}`)));
  const tm = addDays(t, 1), mon = nextMonday(t), first = firstOfNextMonth(t);
  opts.push(btn(`Завтра · ${dm(tm)}`, `nd:${tm}`), btn(`Пн · ${dm(mon)}`, `nd:${mon}`));
  opts.push(btn(`1-ше число · ${dm(first)}`, `nd:${first}`), btn("📅 Своя дата", "ndc"));
  opts.push(wide(btn("Скасувати", "h")));
  return { text: "➕ Новий потік\nКоли старт?", kb: rows(opts) };
}

async function screenNewGroup(db, draft, env) {
  const t = today(env);
  const list = await db.streams();
  const cur = pickCurrent(list.filter((s) => s.groupId), t);
  const kb = [];
  if (cur?.groupId) kb.push(wide(btn(`Та сама група · ${cur.groupTitle || "поточна"}`, "ng:same")));
  kb.push(wide(btn("Нова група (окремий канал)", "ng:new")), wide(btn("← Інша дата", "n")));
  return { text: `Старт: ${fmt(draft.date)} · дні 1–${TOTAL_DAYS} (до ${fmt(addDays(draft.date, TOTAL_DAYS - 1))})\n\nДе йтиме потік?`, kb: rows(kb) };
}

function screenOverlap(ov, draft) {
  const after = addDays(endDate(ov), 1);
  return {
    text: `У цій групі ще йде «${ov.name}» (до ${fmt(endDate(ov))}).\nВ одній групі одночасно — лише один потік.`,
    kb: rows([
      wide(btn(`Почати одразу після нього · ${dm(after)}`, `nd2:${after}`)),
      wide(btn(`Закрити «${ov.name}» раніше і почати ${dm(draft.date)}`, "ncl")),
      wide(btn("Новий потік в іншій групі", "ng:new")),
      wide(btn("Скасувати", "h")),
    ]),
  };
}

async function screenNewName(db, draft) {
  const auto = uniqueName(await db.streams(), monthName(draft.date));
  return { text: "Назва потоку?", kb: rows([wide(btn(auto, "nn:auto")), wide(btn("✏️ Своя назва", "nnc")), wide(btn("Скасувати", "h"))]) };
}

function screenNewConfirm(draft) {
  return {
    text: [
      "Перевір:",
      `Потік «${draft.name}»`,
      `Старт: ${fmt(draft.date)} · дні 1–${TOTAL_DAYS} (до ${fmt(addDays(draft.date, TOTAL_DAYS - 1))})`,
      `Група: ${draft.groupId ? draft.groupTitle || "та сама" : "нова — після створення додаси мене адміном"}`,
      ...(draft.closeFirst ? [`⚠️ Перед цим буде закрито «${draft.closeName}» (з фіналом у групі)`] : []),
      "",
      "Учасники потраплять у нього самі — анкетою або першою відміткою.",
    ].join("\n"),
    kb: rows([btn("✅ Створити", "ny"), btn("Змінити", "n")]),
  };
}

// ---------------------------------------------------------------- показ
async function show(api, chatId, scr, editMsgId) {
  const body = { text: scr.text, reply_markup: { inline_keyboard: scr.kb }, link_preview_options: { is_disabled: true } };
  if (editMsgId) {
    try { return await api.call("editMessageText", { chat_id: chatId, message_id: editMsgId, ...body }); } catch (e) {
      if (/not modified/i.test(e.message)) return;
    }
  }
  return api.call("sendMessage", { chat_id: chatId, ...body });
}

/** /start, /menu: якщо активний потік один — одразу він, інакше список */
export async function handleMenuCommand(m, db, api, env) {
  await setPending(db, m.from.id, null);
  const active = (await db.streams()).filter((s) => s.status === "active");
  const scr = active.length === 1 ? await screenStream(db, active[0].id, env) : await screenHome(db, env);
  return show(api, m.chat.id, scr);
}

/** Натискання кнопок */
export async function handleCallback(cq, db, api, env) {
  const ack = (text) => api.call("answerCallbackQuery", { callback_query_id: cq.id, ...(text ? { text } : {}) }).catch(() => {});
  if (!cq.message || !(await isAdmin(db, cq.from.id))) return ack();
  const chatId = cq.message.chat.id, msgId = cq.message.message_id, uid = cq.from.id;
  const [a, x, y] = String(cq.data || "").split(":");
  const id = Number(x);
  const go = async (scr) => { await ack(); return show(api, chatId, scr, msgId); };
  let draft = (await getPending(db, uid))?.kind === "new" ? (await getPending(db, uid)).draft : null;
  const saveDraft = (d, step) => setPending(db, uid, { kind: "new", step, draft: d });

  switch (a) {
    case "h": await setPending(db, uid, null); return go(await screenHome(db, env));
    case "s": await setPending(db, uid, null); return go(await screenStream(db, id, env));
    case "st": return go(await screenStatus(db, id, env));
    case "w": return go(await screenWeek(db, id, env));
    case "wv": return go(await screenWeekPreview(db, id, Number(y), env));
    case "wp": return go({
      text: `Опублікувати підсумок ${y}-го тижня в групі під постом дня?`,
      kb: rows([btn("✅ Так", `wpc:${id}:${y}`), btn("Скасувати", `w:${id}`)]),
    });
    case "wpc": {
      const st = await db.stream(id);
      const v = db.forStream(st);
      const s = await v.all();
      const day = await currentDayOf(v, s, env);
      const r = await postWeek(env, v, s, Number(y), Math.min(day, TOTAL_DAYS) || null, api);
      if (r.posted) await v.claimWeek(Number(y));
      return go({ text: r.posted ? `Опубліковано підсумок ${y}-го тижня ✅${r.underDayPost ? "" : " (поста дня не знайшов — написав просто в групу)"}` : `Не опубліковано: ${r.reason}`, kb: rows([wide(btn("← До потоку", `s:${id}`))]) });
    }
    case "md": return go(await screenMedals(db, id, env));
    case "mt": {
      const st = await db.stream(id);
      const v = db.forStream(st);
      const s = await v.all();
      for (const x2 of (await db.streams()).filter((q) => q.status === "active")) await seedAwards(db.forStream(x2), await db.forStream(x2).all(), env);
      await db.set({ medalsInChat: s.medalsInChat !== true });
      return go(await screenMedals(db, id, env));
    }
    case "dt": {
      const st = await db.stream(id);
      await setPending(db, uid, { kind: "date", streamId: id });
      return go({ text: `⚙️ Дата старту «${st.name}»: ${fmt(st.startDate)}\n\nНапиши нову дату: 10.11 або 10.11.2026`, kb: rows([wide(btn("Скасувати", `s:${id}`))]) });
    }
    case "c": return go(await screenClose(db, id));
    case "cc": {
      await closeStream(db, id, y === "1", api, env);
      return go(await screenStream(db, id, env));
    }

    // ---- новий потік
    case "n": await saveDraft({}, "date"); return go(await screenNewDate(db, env));
    case "ndc": await saveDraft(draft || {}, "date-text"); return go({ text: "Напиши дату старту: 10.12 або 10.12.2026", kb: rows([wide(btn("Скасувати", "h"))]) });
    case "nd": { const d = { ...(draft || {}), date: x }; await saveDraft(d, "group"); return go(await screenNewGroup(db, d, env)); }
    case "nd2": { // нова дата після перетину — одразу в ту саму групу
      const d = { ...(draft || {}), date: x };
      return pickGroup(d, "same");
    }
    case "ng": return pickGroup({ ...(draft || {}) }, x);
    case "ncl": {
      if (!draft?.overlapId) return go(await screenHome(db, env));
      const d = { ...draft, closeFirst: draft.overlapId, closeName: draft.overlapName };
      await saveDraft(d, "name");
      return go(await screenNewName(db, d));
    }
    case "nn": {
      if (!draft?.date) return go(await screenHome(db, env));
      const d = { ...draft, name: uniqueName(await db.streams(), monthName(draft.date)) };
      await saveDraft(d, "confirm");
      return go(screenNewConfirm(d));
    }
    case "nnc": await saveDraft(draft || {}, "name-text"); return go({ text: "Напиши назву потоку, наприклад «Зимовий старт»", kb: rows([wide(btn("Скасувати", "h"))]) });
    case "ny": {
      if (!draft?.date || !draft?.name) return go(await screenHome(db, env));
      if (draft.closeFirst) await closeStream(db, draft.closeFirst, true, api, env);
      else if (draft.groupId) { // ще раз перевірити перетин (раптом щось змінилось)
        const ov = overlapIn(await db.streams(), draft.groupId, draft.date);
        if (ov) return go(screenOverlap(ov, draft));
      }
      const newId = await db.createStream({ name: draft.name, groupId: draft.groupId || null, groupTitle: draft.groupTitle || null, startDate: draft.date });
      await setPending(db, uid, null);
      const scr = await screenStream(db, newId, env);
      scr.text = `✅ Потік «${draft.name}» створено.\n${draft.groupId ? `Пости «День N» з ${fmt(draft.date)} у групі рахуються в нього.` : "Тепер додай мене адміном у групу коментарів нового каналу — я привʼяжу її до цього потоку."}\n\n` + scr.text;
      return go(scr);
    }
    default: return ack();
  }

  async function pickGroup(d, which) {
    if (!d.date) return go(await screenHome(db, env));
    if (which === "same") {
      const list = await db.streams();
      const cur = pickCurrent(list.filter((s) => s.groupId), today(env));
      if (!cur?.groupId) return go(await screenNewGroup(db, d, env));
      d.groupId = cur.groupId; d.groupTitle = cur.groupTitle;
      const ov = overlapIn(list, d.groupId, d.date);
      if (ov) {
        d.overlapId = ov.id; d.overlapName = ov.name;
        await saveDraft(d, "overlap");
        return go(screenOverlap(ov, d));
      }
    } else { d.groupId = null; d.groupTitle = null; }
    delete d.closeFirst; delete d.closeName;
    await saveDraft(d, "name");
    return go(await screenNewName(db, d));
  }
}

/** Текст у відповідь на питання меню (дата, назва). Повертає true, якщо оброблено. */
export async function handleMenuText(m, db, api, env) {
  if (!(await isAdmin(db, m.from.id))) return false;
  const p = await getPending(db, m.from.id);
  if (!p) return false;
  const text = m.text.trim();
  const t = today(env);
  const ask = (msg, kb = rows([wide(btn("Скасувати", "h"))])) => show(api, m.chat.id, { text: msg, kb });
  const parseShort = (s) => {
    const full = parseDate(s);
    if (full) return full;
    const mm = s.match(/^(\d{1,2})[.\/](\d{1,2})$/);
    if (!mm) return null;
    let y = Number(t.slice(0, 4));
    let ymd = parseDate(`${mm[1]}.${mm[2]}.${y}`);
    if (ymd && ymd < t) ymd = parseDate(`${mm[1]}.${mm[2]}.${y + 1}`); // найближча майбутня
    return ymd;
  };

  if (p.kind === "date") {
    const ymd = parseDate(text) || (() => { const mm = text.match(/^(\d{1,2})[.\/](\d{1,2})$/); return mm ? parseDate(`${mm[1]}.${mm[2]}.${t.slice(0, 4)}`) : null; })();
    if (!ymd) return ask(`Не розібрав дату «${text}». Напиши як 10.11 або 10.11.2026`);
    const st = await db.stream(p.streamId);
    if (st?.groupId) {
      const ov = overlapIn((await db.streams()).filter((s) => s.id !== st.id), st.groupId, ymd);
      if (ov) return ask(`З цією датою потік перетнеться з «${ov.name}» у тій самій групі. Обери іншу дату.`);
    }
    await db.updateStream(p.streamId, { startDate: ymd });
    await setPending(db, m.from.id, null);
    const scr = await screenStream(db, p.streamId, env);
    scr.text = `✅ Дата старту: ${fmt(ymd)}\n\n` + scr.text;
    return show(api, m.chat.id, scr);
  }
  if (p.kind === "new" && p.step === "date-text") {
    const ymd = parseShort(text);
    if (!ymd) return ask(`Не розібрав дату «${text}». Напиши як 10.12 або 10.12.2026`);
    if (ymd < t) return ask("Ця дата вже минула. Обери майбутню.");
    const d = { ...p.draft, date: ymd };
    await setPending(db, m.from.id, { kind: "new", step: "group", draft: d });
    return show(api, m.chat.id, await screenNewGroup(db, d, env));
  }
  if (p.kind === "new" && p.step === "name-text") {
    if (text.length < 2) return ask("Закоротка назва. Спробуй ще раз.");
    const d = { ...p.draft, name: uniqueName(await db.streams(), text.slice(0, 40)) };
    await setPending(db, m.from.id, { kind: "new", step: "confirm", draft: d });
    return show(api, m.chat.id, screenNewConfirm(d));
  }
  return false;
}
