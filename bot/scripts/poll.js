// Локальний запуск без деплою: бот сам забирає оновлення з Telegram (long polling).
// npm run poll   (зупинити: Ctrl+C)
// Увага: поки працює polling, вебхук вимкнено. Після деплою відкрий /api/setup ще раз.
import { tg } from "../lib/telegram.js";
import { handleUpdate, BOT_COMMANDS } from "../lib/handler.js";

const api = tg();
const me = await api.call("getMe");
await api.call("deleteWebhook", { drop_pending_updates: false });
await api.call("setMyCommands", { commands: BOT_COMMANDS, scope: { type: "all_private_chats" } });
console.log(`✅ @${me.username} запущено локально. Пиши йому в Telegram. Ctrl+C — зупинити.`);

let offset = 0;
for (;;) {
  try {
    const updates = await api.call("getUpdates", {
      offset, timeout: 30, allowed_updates: ["message", "edited_message", "my_chat_member"],
    });
    for (const u of updates) {
      offset = u.update_id + 1;
      const m = u.message || u.edited_message;
      console.log(`← ${m ? (m.chat.title || m.chat.first_name) + ": " + (m.text || m.caption || "").slice(0, 60) : Object.keys(u)[1]}`);
      await handleUpdate(u, api).catch((e) => console.error("помилка:", e.message));
    }
  } catch (e) {
    console.error("polling:", e.message);
    await new Promise((r) => setTimeout(r, 3000));
  }
}
