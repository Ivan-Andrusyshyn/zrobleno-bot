// Локальний API для лендінгу: http://localhost:3000/api/participants
// npm run api
import http from "node:http";
import { participantsPayload } from "../lib/handler.js";

const PORT = Number(process.env.PORT || 3000);
http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.url.startsWith("/api/participants")) {
    try {
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify(await participantsPayload()));
    } catch (e) {
      res.statusCode = 500; res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  res.statusCode = 404; res.end("not found");
}).listen(PORT, () => console.log(`API: http://localhost:${PORT}/api/participants`));
