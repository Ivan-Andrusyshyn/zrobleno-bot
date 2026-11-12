// Cloudflare Pages Function: одноразове підключення вебхука → відкрий /api/setup?key=WEBHOOK_SECRET
import { tg } from "../../server/telegram.js";
import { BOT_COMMANDS, setAdminMenu } from "../../server/handler.js";
import { store } from "../../server/store.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (!env.WEBHOOK_SECRET || url.searchParams.get("key") !== env.WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  try {
    const api = tg(env.BOT_TOKEN);
    const me = await api.call("getMe");
    const hook = `${url.origin}/api/tg`;
    await api.call("setWebhook", {
      url: hook, secret_token: env.WEBHOOK_SECRET,
      allowed_updates: ["message", "edited_message", "my_chat_member"],
    });
    await api.call("setMyCommands", { commands: BOT_COMMANDS, scope: { type: "all_private_chats" } });
    const admins = env.DB ? (await (await store(env.DB)).all()).admins || [] : [];
    for (const id of admins) await setAdminMenu(api, id).catch(() => {});
    return Response.json({ ok: true, bot: `@${me.username}`, webhook: hook });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
