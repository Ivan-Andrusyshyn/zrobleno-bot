// Підключення до MongoDB. Клієнт кешується між викликами функції (Vercel перевикористовує «теплі» інстанси).
import { MongoClient } from "mongodb";

let clientPromise = null;
let indexesReady = null;

export async function getDb() {
  if (!clientPromise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("Немає MONGODB_URI у змінних середовища (.env)");
    clientPromise = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 }).connect();
  }
  const db = (await clientPromise).db(process.env.MONGODB_DB || "zrobleno");
  if (!indexesReady) indexesReady = ensureIndexes(db);
  await indexesReady;
  return db;
}

/** Індекси: одна відмітка на людину на день, швидкий пошук постів */
export async function ensureIndexes(db) {
  await Promise.all([
    db.collection("checkins").createIndex({ userId: 1, day: 1 }, { unique: true }),
    db.collection("threads").createIndex({ chatId: 1, msgId: 1 }, { unique: true }),
    db.collection("threads").createIndex({ kind: 1, num: -1 }),
    db.collection("participants").createIndex({ userId: 1 }, { unique: true }),
  ]);
}

/** Для тестів: підставити свою «базу» */
export function __setDbForTests(db) {
  clientPromise = Promise.resolve({ db: () => db });
  indexesReady = Promise.resolve();
}
