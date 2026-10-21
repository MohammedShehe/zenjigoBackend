const db = require('../config/db');
const ApiError = require('../utils/ApiError');

/** Tables keyed by user id column name variants. Order matters for delete (children first). */
const DRIVER_TABLES = [
  { table: 'driver_locations', col: 'driver_id' },
  { table: 'driver_earning_ledger', col: 'driver_id' },
  { table: 'driver_settlements', col: 'driver_id' },
  { table: 'driver_payment_methods', col: 'driver_id' },
  { table: 'payout_requests', col: 'driver_id' },
  { table: 'driver_documents', col: 'driver_id' },
  { table: 'vehicles', col: 'driver_id' },
  { table: 'driver_profiles', col: 'user_id' }
];

const RIDER_TABLES = [
  { table: 'saved_locations', col: 'user_id' },
  { table: 'cancellation_debts', col: 'rider_id' },
  { table: 'tour_bookings', col: 'rider_id' },
  { table: 'rider_profiles', col: 'user_id' }
];

const SHARED_TABLES = [
  { table: 'wallet_transactions', col: 'user_id' },
  { table: 'wallets', col: 'user_id' },
  { table: 'promo_redemptions', col: 'user_id' },
  { table: 'device_tokens', col: 'user_id' },
  { table: 'notifications', col: 'user_id' },
  { table: 'refresh_tokens', col: 'user_id' },
  { table: 'conversation_members', col: 'user_id' }
];

async function safeSelect(conn, sql, params) {
  try {
    const [rows] = await conn.query(sql, params);
    return rows;
  } catch (e) {
    // Table may not exist in older deployments — skip
    if (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146) return [];
    throw e;
  }
}

async function safeDelete(conn, table, col, id) {
  try {
    await conn.query(`DELETE FROM \`${table}\` WHERE \`${col}\` = ?`, [id]);
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146) return;
    throw e;
  }
}

async function collectSnapshot(conn, userId, role) {
  const snapshot = { version: 1, collectedAt: new Date().toISOString(), role, userId };

  const [users] = await conn.query('SELECT * FROM users WHERE id = ?', [userId]);
  if (!users.length) throw ApiError.notFound('User not found');
  snapshot.users = users[0];

  const shared = [...SHARED_TABLES];
  if (role === 'driver') shared.push(...DRIVER_TABLES);
  if (role === 'rider') shared.push(...RIDER_TABLES);

  for (const { table, col } of shared) {
    snapshot[table] = await safeSelect(conn, `SELECT * FROM \`${table}\` WHERE \`${col}\` = ?`, [userId]);
  }

  // Rides as rider or driver
  snapshot.rides_as_rider = await safeSelect(conn, 'SELECT * FROM rides WHERE rider_id = ?', [userId]);
  snapshot.rides_as_driver = await safeSelect(conn, 'SELECT * FROM rides WHERE driver_id = ?', [userId]);

  // Parcels
  snapshot.parcels_as_rider = await safeSelect(conn, 'SELECT * FROM parcels WHERE rider_id = ?', [userId]);
  snapshot.parcels_as_driver = await safeSelect(conn, 'SELECT * FROM parcels WHERE driver_id = ?', [userId]);

  // Messages sent by user
  snapshot.messages = await safeSelect(conn, 'SELECT * FROM messages WHERE sender_id = ?', [userId]);

  // Ride ratings if table exists
  snapshot.ride_ratings = await safeSelect(
    conn,
    'SELECT * FROM ride_ratings WHERE rater_id = ? OR ratee_id = ?',
    [userId, userId]
  );

  return snapshot;
}

async function purgeLiveData(conn, userId, role) {
  // Null out non-cascade references where user is secondary (driver on rides/parcels)
  try {
    await conn.query('UPDATE rides SET driver_id = NULL WHERE driver_id = ?', [userId]);
  } catch (_) {}
  try {
    await conn.query('UPDATE parcels SET driver_id = NULL WHERE driver_id = ?', [userId]);
  } catch (_) {}
  try {
    await conn.query('UPDATE tour_bookings SET driver_id = NULL WHERE driver_id = ?', [userId]);
  } catch (_) {}

  // Delete rides where this user is the rider (rider_id is NOT NULL, no cascade)
  if (role === 'rider') {
    // Delete child rows that reference rides first if needed — rely on ride cascades where present
    const rides = await safeSelect(conn, 'SELECT id FROM rides WHERE rider_id = ?', [userId]);
    for (const r of rides) {
      try { await conn.query('DELETE FROM ride_events WHERE ride_id = ?', [r.id]); } catch (_) {}
      try { await conn.query('DELETE FROM ride_ratings WHERE ride_id = ?', [r.id]); } catch (_) {}
      try { await conn.query('DELETE FROM payments WHERE ride_id = ?', [r.id]); } catch (_) {}
    }
    await safeDelete(conn, 'rides', 'rider_id', userId);
    await safeDelete(conn, 'parcels', 'rider_id', userId);
  }

  // Messages
  await safeDelete(conn, 'messages', 'sender_id', userId);

  // Role-specific then shared
  const tables = [];
  if (role === 'driver') tables.push(...DRIVER_TABLES);
  if (role === 'rider') tables.push(...RIDER_TABLES);
  tables.push(...SHARED_TABLES);

  for (const { table, col } of tables) {
    await safeDelete(conn, table, col, userId);
  }

  // Finally the user row
  await conn.query('DELETE FROM users WHERE id = ?', [userId]);
}

/**
 * Archive a live user: snapshot all related data, remove from live tables.
 * Archived users cannot log in (row is gone from users).
 */
async function archiveUser(userId, archivedBy, reason = null) {
  return db.transaction(async (conn) => {
    const [users] = await conn.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (!users.length) throw ApiError.notFound('User not found');
    const user = users[0];

    // Prevent archiving the last active admin
    if (user.role === 'admin') {
      const [[{ n }]] = await conn.query(
        `SELECT COUNT(*) n FROM users WHERE role='admin' AND status='active' AND id <> ?`,
        [userId]
      );
      if (Number(n) < 1) throw ApiError.badRequest('Cannot archive the last active admin account.');
    }

    // Already archived?
    const [existing] = await conn.query(
      'SELECT id FROM user_archives WHERE original_user_id = ?',
      [userId]
    );
    if (existing.length) throw ApiError.conflict('This user is already in the archive.');

    const snapshot = await collectSnapshot(conn, userId, user.role);

    const [ins] = await conn.query(
      `INSERT INTO user_archives(original_user_id, role, full_name, phone, email, snapshot, archived_by, archive_reason)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        user.id,
        user.role,
        user.full_name,
        user.phone,
        user.email || null,
        JSON.stringify(snapshot),
        archivedBy || null,
        reason || null
      ]
    );

    await purgeLiveData(conn, userId, user.role);

    return {
      archiveId: ins.insertId,
      originalUserId: user.id,
      role: user.role,
      fullName: user.full_name
    };
  });
}

async function listArchives({ role, limit = 500 } = {}) {
  const lim = Math.min(Number(limit) || 500, 1000);
  if (role) {
    return db.query(
      `SELECT id, original_user_id originalUserId, role, full_name fullName, phone, email,
              archive_reason archiveReason, archived_by archivedBy, archived_at archivedAt
       FROM user_archives WHERE role = ? ORDER BY archived_at DESC LIMIT ${lim}`,
      [role]
    );
  }
  return db.query(
    `SELECT id, original_user_id originalUserId, role, full_name fullName, phone, email,
            archive_reason archiveReason, archived_by archivedBy, archived_at archivedAt
     FROM user_archives ORDER BY archived_at DESC LIMIT ${lim}`
  );
}

async function getArchive(archiveId) {
  const rows = await db.query(
    `SELECT id, original_user_id originalUserId, role, full_name fullName, phone, email,
            archive_reason archiveReason, archived_by archivedBy, archived_at archivedAt, snapshot
     FROM user_archives WHERE id = ?`,
    [archiveId]
  );
  if (!rows.length) throw ApiError.notFound('Archive entry not found');
  const row = rows[0];
  if (typeof row.snapshot === 'string') {
    try { row.snapshot = JSON.parse(row.snapshot); } catch (_) {}
  }
  return row;
}

async function insertRows(conn, table, rows) {
  if (!rows || !rows.length) return;
  for (const row of rows) {
    const cols = Object.keys(row);
    if (!cols.length) continue;
    const placeholders = cols.map(() => '?').join(',');
    const colList = cols.map((c) => `\`${c}\``).join(',');
    try {
      await conn.query(
        `INSERT INTO \`${table}\` (${colList}) VALUES (${placeholders})`,
        cols.map((c) => row[c])
      );
    } catch (e) {
      if (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146) continue;
      // Duplicate key on restore race
      if (e.code === 'ER_DUP_ENTRY') {
        throw ApiError.conflict(
          `Cannot restore: a live record already conflicts with archived data in ${table} (${e.message})`
        );
      }
      throw e;
    }
  }
}

/**
 * Restore archived user with original ids and related data.
 */
async function restoreUser(archiveId) {
  return db.transaction(async (conn) => {
    const [rows] = await conn.query('SELECT * FROM user_archives WHERE id = ? FOR UPDATE', [archiveId]);
    if (!rows.length) throw ApiError.notFound('Archive entry not found');
    const archive = rows[0];
    let snapshot = archive.snapshot;
    if (typeof snapshot === 'string') snapshot = JSON.parse(snapshot);

    const originalId = archive.original_user_id;

    // Ensure no live user with same id / same role+phone
    const [liveById] = await conn.query('SELECT id FROM users WHERE id = ?', [originalId]);
    if (liveById.length) {
      throw ApiError.conflict('A live user already exists with this original id. Cannot restore.');
    }
    const [liveByPhone] = await conn.query(
      'SELECT id FROM users WHERE role = ? AND phone = ?',
      [archive.role, archive.phone]
    );
    if (liveByPhone.length) {
      throw ApiError.conflict('A live user with the same role and phone already exists.');
    }
    if (archive.email) {
      const [liveByEmail] = await conn.query(
        'SELECT id FROM users WHERE role = ? AND email = ?',
        [archive.role, archive.email]
      );
      if (liveByEmail.length) {
        throw ApiError.conflict('A live user with the same role and email already exists.');
      }
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    try {
      // User first
      if (snapshot.users) {
        await insertRows(conn, 'users', [snapshot.users]);
      }

      // Profiles / role tables
      const restoreOrder = [
        'rider_profiles',
        'driver_profiles',
        'vehicles',
        'driver_documents',
        'wallets',
        'wallet_transactions',
        'saved_locations',
        'device_tokens',
        'notifications',
        'refresh_tokens',
        'promo_redemptions',
        'driver_payment_methods',
        'driver_settlements',
        'driver_earning_ledger',
        'driver_locations',
        'payout_requests',
        'cancellation_debts',
        'tour_bookings',
        'rides_as_rider',
        'rides_as_driver',
        'parcels_as_rider',
        'parcels_as_driver',
        'conversation_members',
        'messages',
        'ride_ratings'
      ];

      const tableMap = {
        rides_as_rider: 'rides',
        rides_as_driver: 'rides',
        parcels_as_rider: 'parcels',
        parcels_as_driver: 'parcels'
      };

      for (const key of restoreOrder) {
        const table = tableMap[key] || key;
        const data = snapshot[key];
        if (!data) continue;
        await insertRows(conn, table, Array.isArray(data) ? data : [data]);
      }
    } finally {
      await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    }

    await conn.query('DELETE FROM user_archives WHERE id = ?', [archiveId]);

    return {
      userId: originalId,
      role: archive.role,
      fullName: archive.full_name,
      restored: true
    };
  });
}

/**
 * Permanently delete an archive entry (and its snapshot). Irreversible.
 */
async function permanentDelete(archiveId) {
  const rows = await db.query('SELECT id, original_user_id, role, full_name FROM user_archives WHERE id = ?', [archiveId]);
  if (!rows.length) throw ApiError.notFound('Archive entry not found');
  await db.query('DELETE FROM user_archives WHERE id = ?', [archiveId]);
  return { deleted: true, archiveId: rows[0].id, originalUserId: rows[0].original_user_id, role: rows[0].role };
}

module.exports = {
  archiveUser,
  listArchives,
  getArchive,
  restoreUser,
  permanentDelete
};
