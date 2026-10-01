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
    // DATABASE_URL first: it's the variable Neon's Vercel integration points at a
    // preview's own database branch, so previews never fall through to production.
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
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

// Runs fn(client) inside one transaction on a single connection: committed if fn
// finishes, rolled back if it throws — for changes that must happen together or not at all.
async function transaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { query, transaction };
