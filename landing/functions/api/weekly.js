// Cloudflare Pages Function: тижневі підсумки за розкладом → GET /api/weekly?key=CRON_KEY
// Pages не вміють cron самі, тому цю адресу щогодини (або щодня о 18:05) смикає зовнішній
// сервіс, наприклад cron-job.org. Публікація відбувається лише раз на тиждень
// (дні 8/15/22/29, після 18:00 за Києвом), усі інші виклики нічого не роблять.
import { runWeekly } from "../../server/weekly.js";

export async function onRequestGet({ request, env }) {
  const key = env.CRON_KEY || env.WEBHOOK_SECRET;
  if (!key || new URL(request.url).searchParams.get("key") !== key) {
    return new Response("forbidden", { status: 403 });
  }
  try {
    return Response.json(await runWeekly(env));
  } catch (e) {
    console.error(e);
    return Response.json({ posted: false, error: e.message }, { status: 500 });
  }
}
