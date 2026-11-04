// Tiny module-stub helper so security logic can be unit-tested without MySQL, SMTP or npm installs.
const path = require('path');
const SRC = path.join(__dirname, '..', 'src');
function stub(rel, exports) {
  const id = require.resolve(path.join(SRC, rel));
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
function fresh(rel) {
  const id = require.resolve(path.join(SRC, rel));
  delete require.cache[id];
  return require(id);
}
/** Scriptable fake DB: handlers are [regex, fn(params, sql) => rows|ResultSetHeader]. */
function fakeDb(handlers) {
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      for (const [re, fn] of handlers) if (re.test(sql)) return fn(params, sql);
      return [];
    },
    transaction: async (cb) => cb({ query: async () => [[]] }),
  };
}
module.exports = { stub, fresh, fakeDb, SRC };
