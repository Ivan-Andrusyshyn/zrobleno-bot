// Netlify: одноразове підключення вебхука → відкрий /api/setup?key=WEBHOOK_SECRET
import { tg } from "../../bot/lib/telegram.js";
import { BOT_COMMANDS } from "../../bot/lib/handler.js";

export default async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== process.env.WEBHOOK_SECRET) return new Response("forbidden", { status: 403 });
  try {
    const api = tg();
    const me = await api.call("getMe");
    const hook = `${url.origin}/api/tg`;
    await api.call("setWebhook", {
      url: hook, secret_token: process.env.WEBHOOK_SECRET,
      allowed_updates: ["message", "edited_message", "my_chat_member"],
    });
    await api.call("setMyCommands", { commands: BOT_COMMANDS, scope: { type: "all_private_chats" } });
    return Response.json({ ok: true, bot: `@${me.username}`, webhook: hook });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
};
