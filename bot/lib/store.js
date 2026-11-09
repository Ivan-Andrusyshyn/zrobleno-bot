// Робота з колекціями MongoDB
//
// settings      { _id: "main", admins: [ids], groupId, groupTitle, startDate }
// threads       { chatId, msgId, kind: "day" | "info", num, createdAt }   — пости каналу в групі коментарів
// participants  { userId, tgName, name, habit, minimum, why, hidden, joinedAt }
// checkins      { userId, day, status: "done" | "min" | "miss", note, text, msgId, updatedAt }
import { getDb } from "./db.js";

const now = () => new Date();

export async function store() {
  const db = await getDb();
  const settings = db.collection("settings");
  const threads = db.collection("threads");
  const participants = db.collection("participants");
  const checkins = db.collection("checkins");

  return {
    async all() {
      return (await settings.findOne({ _id: "main" })) || {};
    },
    async set(fields) {
      await settings.updateOne({ _id: "main" }, { $set: fields }, { upsert: true });
    },

    async saveThread(chatId, msgId, kind, num) {
      await threads.updateOne(
        { chatId: String(chatId), msgId },
        { $set: { kind, num: num ?? null }, $setOnInsert: { createdAt: now() } },
        { upsert: true },
      );
    },
    async thread(chatId, msgId) {
      return threads.findOne({ chatId: String(chatId), msgId });
    },
    async maxDay() {
      const [t] = await threads.find({ kind: "day" }).sort({ num: -1 }).limit(1).toArray();
      return t?.num ?? 0;
    },

    async touchParticipant(userId, tgName) {
      await participants.updateOne(
        { userId },
        { $set: { tgName }, $setOnInsert: { hidden: false, joinedAt: now() } },
        { upsert: true },
      );
    },
    async saveProfile(userId, p) {
      await participants.updateOne({ userId }, { $set: { name: p.name, habit: p.habit, minimum: p.minimum, why: p.why } });
    },
    async setHidden(userId, hidden) {
      await participants.updateOne({ userId }, { $set: { hidden } });
    },

    async saveCheckin(userId, day, status, note, text, msgId) {
      await checkins.updateOne(
        { userId, day },
        { $set: { status, note, text, msgId, updatedAt: now() } },
        { upsert: true },
      );
    },

    async participantsWithCheckins() {
      const people = await participants.find({ hidden: { $ne: true } }).sort({ joinedAt: 1 }).toArray();
      const ids = people.map((p) => p.userId);
      const marks = await checkins.find({ userId: { $in: ids } }).toArray();
      return { people, marks };
    },

    async counts(day) {
      const [p, today, posts] = await Promise.all([
        participants.countDocuments({}),
        checkins.countDocuments({ day }),
        threads.countDocuments({ kind: "day" }),
      ]);
      return { participants: p, today, dayPosts: posts };
    },
  };
}
