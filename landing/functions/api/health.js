import { store } from "../../server/store.js";
import { currentStream } from "../../server/streams.js";
// GET /api/health — перевірка: база, секрети і стан вебхука Telegram (без розкриття значень)
export async function onRequestGet({ env, request }) {
  let db = false;
  try { await env.DB.prepare("SELECT 1").first(); db = true; } catch {}

  let webhook = null;
  if (env.BOT_TOKEN) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/getWebhookInfo`);
      const d = await r.json();
      const expected = `${new URL(request.url).origin}/api/tg`;
      webhook = d.ok
        ? {
            connected: d.result.url === expected,
            url: d.result.url || "(не задано — відкрий /api/setup?key=...)",
            pending: d.result.pending_update_count,
            lastError: d.result.last_error_message || null,
            lastErrorAt: d.result.last_error_date ? new Date(d.result.last_error_date * 1000).toISOString() : null,
          }
        : { error: d.description };
    } catch (e) {
      webhook = { error: String(e.message || e) };
    }
  }

  let settings = null;
  try {
    const base = await store(env.DB);
    const g = await base.all();
    const streams = await base.streams();
    const cur = await currentStream(base, env);
    const c = await env.DB.batch([
      env.DB.prepare("SELECT kind, COUNT(*) AS n FROM threads WHERE stream_id = ? GROUP BY kind").bind(cur?.id ?? -1),
      env.DB.prepare("SELECT COUNT(*) AS n FROM stream_members WHERE stream_id = ?").bind(cur?.id ?? -1),
      env.DB.prepare("SELECT COUNT(*) AS n FROM stream_checkins WHERE stream_id = ?").bind(cur?.id ?? -1),
    ]);
    settings = {
      admins: (g.admins || []).length,
      stream: cur ? { id: cur.id, name: cur.name, status: cur.status } : null,
      streams: streams.length,
      group: cur?.groupTitle || null, startDate: cur?.startDate || null,
      posts: Object.fromEntries(c[0].results.map((r) => [r.kind, r.n])),
      participants: c[1].results[0].n, checkins: c[2].results[0].n,
      lastSkippedComment: g.lastSkip || null,
    };
  } catch (e) { settings = { error: String(e.message || e) }; }

  return Response.json({
    ok: db && !!env.BOT_TOKEN && !!env.WEBHOOK_SECRET && !!env.ADMIN_CODE && !!webhook?.connected,
    db, botToken: !!env.BOT_TOKEN, webhookSecret: !!env.WEBHOOK_SECRET, adminCode: !!env.ADMIN_CODE,
    webhook, settings,
  });
}
