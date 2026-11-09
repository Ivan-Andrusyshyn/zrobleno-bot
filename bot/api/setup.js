// Vercel: одноразове підключення вебхука → відкрий у браузері /api/setup?key=WEBHOOK_SECRET
import { tg } from "../lib/telegram.js";
import { BOT_COMMANDS } from "../lib/handler.js";

export default async function handler(req, res) {
  if (req.query.key !== process.env.WEBHOOK_SECRET) return res.status(403).send("forbidden");
  try {
    const api = tg();
    const me = await api.call("getMe");
    const url = `https://${req.headers.host}/api/tg`;
    await api.call("setWebhook", {
      url, secret_token: process.env.WEBHOOK_SECRET,
      allowed_updates: ["message", "edited_message", "my_chat_member"],
    });
    await api.call("setMyCommands", { commands: BOT_COMMANDS, scope: { type: "all_private_chats" } });
    res.status(200).json({ ok: true, bot: `@${me.username}`, webhook: url });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
