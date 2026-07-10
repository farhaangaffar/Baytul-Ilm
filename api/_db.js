const { Pool, types } = require('pg');

// Return DATE columns as plain 'YYYY-MM-DD' strings instead of JS Date objects —
// the app anchors all date math on plain date strings (often at noon local time)
// to avoid timezone off-by-one bugs, and a parsed Date/ISO-datetime would reintroduce that.
types.setTypeParser(1082, val => val);
// NUMERIC/DECIMAL columns (money) come back as strings by default to avoid float
// precision loss on arbitrary-precision values — the amounts here are small
// currency figures where a JS number is perfectly safe, and the frontend expects numbers.
types.setTypeParser(1700, val => val === null ? null : parseFloat(val));

let pool;
function getPool() {
  if (!pool) {
    const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    if (!connectionString) throw new Error('No POSTGRES_URL/DATABASE_URL set');
    pool = new Pool({
      connectionString,
      ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

async function query(text, params) {
  return getPool().query(text, params);
}

module.exports = { query };
