// Cloudflare Pages Function: (необовʼязково) підсумки за зовнішнім розкладом → GET /api/summary?key=CRON_KEY
// Зазвичай не потрібно: бот і так публікує підсумок з першим коментарем після 18:00.
import { runSummary } from "../../server/summary.js";

export async function onRequestGet({ request, env }) {
  const key = env.CRON_KEY || env.WEBHOOK_SECRET;
  if (!key || new URL(request.url).searchParams.get("key") !== key) {
    return new Response("forbidden", { status: 403 });
  }
  try {
    return Response.json(await runSummary(env));
  } catch (e) {
    console.error(e);
    return Response.json({ posted: false, error: e.message }, { status: 500 });
  }
}
