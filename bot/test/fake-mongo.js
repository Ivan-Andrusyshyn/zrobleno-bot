// Дуже проста MongoDB у памʼяті — лише ті операції, які використовує бот (для тестів без сервера)

function matches(doc, q) {
  return Object.entries(q).every(([k, v]) => {
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      if ("$ne" in v) return doc[k] !== v.$ne;
      if ("$in" in v) return v.$in.includes(doc[k]);
    }
    return doc[k] === v;
  });
}

class Cursor {
  constructor(docs) { this.docs = docs; }
  sort(spec) {
    const [[k, dir]] = Object.entries(spec);
    this.docs.sort((a, b) => (a[k] > b[k] ? dir : a[k] < b[k] ? -dir : 0));
    return this;
  }
  limit(n) { this.docs = this.docs.slice(0, n); return this; }
  async toArray() { return this.docs.map((d) => ({ ...d })); }
}

class Collection {
  constructor() { this.docs = []; }
  async createIndex() {}
  async findOne(q) { const d = this.docs.find((x) => matches(x, q)); return d ? { ...d } : null; }
  find(q = {}) { return new Cursor(this.docs.filter((x) => matches(x, q))); }
  async countDocuments(q = {}) { return this.docs.filter((x) => matches(x, q)).length; }
  async updateOne(q, upd, opts = {}) {
    let d = this.docs.find((x) => matches(x, q));
    if (!d) {
      if (!opts.upsert) return { matchedCount: 0 };
      d = { ...q, ...(upd.$setOnInsert || {}) };
      this.docs.push(d);
    }
    Object.assign(d, upd.$set || {});
    return { matchedCount: 1 };
  }
}

export function fakeDb() {
  const cols = {};
  return { collection: (name) => (cols[name] ||= new Collection()), cols };
}
