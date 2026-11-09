// Мінімальний клієнт Telegram Bot API (вбудований fetch, Node 18+)

export function tg(token = process.env.BOT_TOKEN) {
  if (!token) throw new Error("Немає BOT_TOKEN у змінних середовища (.env)");
  const base = `https://api.telegram.org/bot${token}/`;
  async function call(method, body = {}) {
    const res = await fetch(base + method, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
    if (!data.ok) throw new Error(`${method}: ${data.description || "помилка Telegram"}`);
    return data.result;
  }
  return {
    call,
    send: (chat_id, text, extra = {}) => call("sendMessage", { chat_id, text, ...extra }),
  };
}
