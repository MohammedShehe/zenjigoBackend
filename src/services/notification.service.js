/**
 * Central push + in-app notification helper.
 * Stores a row in `notifications` and sends FCM to all device tokens for the user.
 */
const db = require('../config/db');
const { sendPush } = require('../config/firebase');

async function tokensFor(userIds) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).map(Number).filter(Boolean))];
  if (!ids.length) return [];
  const rows = await db.query(
    `SELECT token FROM device_tokens WHERE user_id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  return rows.map((r) => r.token).filter(Boolean);
}

/**
 * Notify one user (DB + FCM).
 * @param {number} userId
 * @param {string} title
 * @param {string} body
 * @param {string} type  short machine type e.g. ride_accepted, chat, document_approved
 * @param {object} data  stringifiable payload for the app
 * @param {{ skipDb?: boolean }} opts
 */
async function notifyUser(userId, title, body, type = 'system', data = {}, opts = {}) {
  if (!userId) return null;
  let insertId = null;
  if (!opts.skipDb) {
    try {
      const r = await db.query(
        'INSERT INTO notifications(user_id,type,title,body,data) VALUES(?,?,?,?,?)',
        [userId, type, title, body, JSON.stringify(data || {})]
      );
      insertId = r.insertId;
    } catch (e) {
      console.warn('[notify] db insert failed', e.message);
    }
  }
  try {
    const tokens = await tokensFor(userId);
    if (tokens.length) {
      const result = await sendPush(tokens, { title, body }, { type, ...(data || {}) });
      if (result.failureCount > 0) {
        // Remove tokens that Firebase explicitly reports as no longer registered.
        const stale = (result.failures || [])
          .filter((failure) => failure.code === 'messaging/registration-token-not-registered')
          .map((failure) => failure.token)
          .filter(Boolean);
        if (stale.length) {
          await db.query(
            `DELETE FROM device_tokens WHERE token IN (${stale.map(() => '?').join(',')})`,
            stale
          );
          console.warn(`[notify] Removed ${stale.length} expired device token(s).`);
        }
        console.warn(`[notify] FCM result for user ${userId}: ${result.successCount} succeeded, ${result.failureCount} failed.`);
      } else if (result.successCount > 0) {
        console.log(`[notify] FCM accepted push for user ${userId} (${result.successCount} device(s)).`);
      }
    }
  } catch (e) {
    console.warn('[notify] push failed', e.message);
  }
  return insertId;
}

/** Notify many users (e.g. promo / tour blast). */
async function notifyMany(userIds, title, body, type = 'system', data = {}) {
  const ids = [...new Set((userIds || []).map(Number).filter(Boolean))];
  for (const id of ids) {
    await notifyUser(id, title, body, type, data);
  }
  return ids.length;
}

/** All active riders (for tours/promos/reminders). */
async function allRiderIds(limit = 5000) {
  const rows = await db.query(
    `SELECT id FROM users WHERE role='rider' AND status='active' ORDER BY id DESC LIMIT ?`,
    [Math.min(Number(limit) || 5000, 20000)]
  );
  return rows.map((r) => r.id);
}

/** All active drivers. */
async function allDriverIds(limit = 5000) {
  const rows = await db.query(
    `SELECT id FROM users WHERE role='driver' AND status IN ('active','pending') ORDER BY id DESC LIMIT ?`,
    [Math.min(Number(limit) || 5000, 20000)]
  );
  return rows.map((r) => r.id);
}

module.exports = {
  notifyUser,
  notifyMany,
  allRiderIds,
  allDriverIds,
  tokensFor
};
