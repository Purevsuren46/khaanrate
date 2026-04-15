// 📦 Cache-aside pattern for bank rates
// Prevents API spam + OOM crashes from repeated fetching

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const store = new Map();

function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > entry.ttl) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

function set(key, data, ttl = CACHE_TTL) {
  store.set(key, { data, ts: Date.now(), ttl });
}

function del(key) {
  store.delete(key);
}

function age(key) {
  const entry = store.get(key);
  if (!entry) return null;
  return Date.now() - entry.ts;
}

function ts(key) {
  const entry = store.get(key);
  if (!entry) return null;
  return new Date(entry.ts).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ulaanbaatar'
  });
}

function clear() {
  store.clear();
}

module.exports = { get, set, del, age, ts, clear, CACHE_TTL };
