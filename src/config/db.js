const mysql = require('mysql2/promise');
const config = require('./env');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.name,
  waitForConnections: true,
  connectionLimit: config.db.connectionLimit,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: 'Z',
  namedPlaceholders: true,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

async function query(sql, params) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function transaction(callback) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function health() {
  await pool.query('SELECT 1');
  return true;
}

module.exports = { pool, query, transaction, health };
