const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const { sendPush } = require('../config/firebase');

let ioRef = null;
function setIo(io) {
  ioRef = io;
}
function getIo() {
  return ioRef;
}

let schemaReady = false;
async function ensureSchema() {
  if (schemaReady) return;
  try {
    await db.query(
      'ALTER TABLE conversation_members ADD COLUMN last_read_at DATETIME NULL DEFAULT NULL'
    );
  } catch (e) {
    // Column already exists or table missing — ignore duplicate column errors
    if (!/Duplicate column|ER_DUP_FIELDNAME/i.test(String(e.message || e))) {
      // non-fatal for other errors in production; log once
      if (!/Unknown table|ER_NO_SUCH_TABLE/i.test(String(e.message || e))) {
        console.warn('[chat] ensureSchema:', e.message);
      }
    }
  }
  schemaReady = true;
}

function mapMessage(row, viewerId) {
  if (!row) return null;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderName: row.sender_name || row.senderName || null,
    senderRole: row.sender_role || row.senderRole || null,
    text: row.is_deleted ? '[deleted]' : row.text,
    replyToId: row.reply_to_id,
    isEdited: !!row.is_edited,
    isDeleted: !!row.is_deleted,
    isMine: Number(row.sender_id) === Number(viewerId),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function ensureRideConversation(userId, rideId) {
  await ensureSchema();
  const r = await db.query('SELECT rider_id, driver_id FROM rides WHERE id=?', [rideId]);
  if (!r.length) throw ApiError.notFound('Ride not found');
  const ids = [r[0].rider_id, r[0].driver_id].filter(Boolean);
  if (!ids.includes(userId)) throw ApiError.forbidden('You are not part of this ride.');
  let c = await db.query('SELECT id FROM conversations WHERE ride_id=? AND type="ride" LIMIT 1', [rideId]);
  let id;
  if (c.length) {
    id = c[0].id;
    // Ensure both parties are members
    for (const uid of ids) {
      await db.query(
        'INSERT IGNORE INTO conversation_members(conversation_id, user_id) VALUES(?,?)',
        [id, uid]
      );
    }
  } else {
    const x = await db.query(
      'INSERT INTO conversations(type, ride_id, title) VALUES("ride", ?, "Ride chat")',
      [rideId]
    );
    id = x.insertId;
    for (const uid of ids) {
      await db.query('INSERT INTO conversation_members(conversation_id, user_id) VALUES(?,?)', [id, uid]);
    }
  }
  return id;
}

async function list(userId) {
  await ensureSchema();
  const rows = await db.query(
    `SELECT
       c.id,
       c.type,
       c.ride_id AS rideId,
       c.title,
       c.is_pinned AS isPinned,
       c.updated_at AS updatedAt,
       (SELECT m.text FROM messages m WHERE m.conversation_id=c.id AND m.is_deleted=0 ORDER BY m.id DESC LIMIT 1) AS lastMessage,
       (SELECT m.created_at FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) AS lastMessageAt,
       (SELECT m.sender_id FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) AS lastSenderId,
       (
         SELECT COUNT(*) FROM messages m
         WHERE m.conversation_id = c.id
           AND m.sender_id <> ?
           AND m.is_deleted = 0
           AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)
       ) AS unreadCount
     FROM conversations c
     JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
     ORDER BY COALESCE(
       (SELECT m.created_at FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1),
       c.updated_at
     ) DESC`,
    [userId, userId]
  );

  // Attach peer label for ride chats
  for (const row of rows) {
    if (row.type === 'support') {
      row.peerName = 'ZenjiGO Support';
      row.peerRole = 'admin';
    } else if (row.type === 'ride' && row.rideId) {
      const peers = await db.query(
        `SELECT u.id, u.full_name, u.role FROM conversation_members cm
         JOIN users u ON u.id = cm.user_id
         WHERE cm.conversation_id = ? AND cm.user_id <> ? LIMIT 1`,
        [row.id, userId]
      );
      if (peers.length) {
        row.peerName = peers[0].full_name;
        row.peerRole = peers[0].role;
        row.peerId = peers[0].id;
      }
      row.title = row.title || (row.peerName ? `Chat with ${row.peerName}` : 'Ride chat');
    }
  }
  return rows;
}

async function messages(userId, cid) {
  await ensureSchema();
  const member = await db.query(
    'SELECT 1 FROM conversation_members WHERE conversation_id=? AND user_id=?',
    [cid, userId]
  );
  if (!member.length) throw ApiError.forbidden('You are not a member of this conversation.');

  const rows = await db.query(
    `SELECT m.*, u.full_name AS sender_name, u.role AS sender_role
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = ?
     ORDER BY m.id ASC`,
    [cid]
  );
  return rows.map((r) => mapMessage(r, userId));
}

async function emitMessage(conversationId, msg, memberIds) {
  const io = getIo();
  if (!io || !msg) return;
  const payload = {
    ...msg,
    conversationId: Number(conversationId)
  };
  io.to(`chat:${conversationId}`).emit('chat:message', payload);
  for (const uid of memberIds || []) {
    io.to(`user:${uid}`).emit('chat:message', payload);
    io.to(`user:${uid}`).emit('chat:updated', {
      conversationId: Number(conversationId),
      lastMessage: payload.text,
      lastMessageAt: payload.createdAt,
      senderId: payload.senderId
    });
  }
}

async function send(userId, cid, text, replyToId) {
  await ensureSchema();
  const member = await db.query(
    'SELECT 1 FROM conversation_members WHERE conversation_id=? AND user_id=?',
    [cid, userId]
  );
  if (!member.length) throw ApiError.forbidden('You are not a member of this conversation.');

  const trimmed = String(text || '').trim();
  if (!trimmed) throw ApiError.badRequest('Message text is required');

  const r = await db.query(
    'INSERT INTO messages(conversation_id, sender_id, text, reply_to_id) VALUES(?,?,?,?)',
    [cid, userId, trimmed, replyToId || null]
  );
  await db.query('UPDATE conversations SET updated_at = UTC_TIMESTAMP() WHERE id=?', [cid]);

  // Sender has effectively read up to this message
  try {
    await db.query(
      'UPDATE conversation_members SET last_read_at = UTC_TIMESTAMP() WHERE conversation_id=? AND user_id=?',
      [cid, userId]
    );
  } catch (_) {}

  const full = (
    await db.query(
      `SELECT m.*, u.full_name AS sender_name, u.role AS sender_role
       FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id=?`,
      [r.insertId]
    )
  )[0];
  const msg = mapMessage(full, userId);

  const others = await db.query(
    'SELECT user_id FROM conversation_members WHERE conversation_id=? AND user_id<>?',
    [cid, userId]
  );
  const memberIds = (
    await db.query('SELECT user_id FROM conversation_members WHERE conversation_id=?', [cid])
  ).map((x) => x.user_id);

  if (others.length) {
    const tokens = await db.query(
      `SELECT token FROM device_tokens WHERE user_id IN (${others.map(() => '?').join(',')})`,
      others.map((x) => x.user_id)
    );
    try {
      await sendPush(
        tokens.map((x) => x.token),
        { title: 'New message', body: trimmed.slice(0, 120) },
        { type: 'chat', conversationId: String(cid) }
      );
    } catch (_) {}
  }

  await emitMessage(cid, msg, memberIds);
  return msg;
}

async function createSupport(userId) {
  await ensureSchema();
  let c = await db.query(
    `SELECT c.id FROM conversations c
     JOIN conversation_members cm ON cm.conversation_id = c.id
     WHERE c.type = 'support' AND cm.user_id = ?
     LIMIT 1`,
    [userId]
  );
  if (c.length) {
    // Ensure all active admins are members so any admin can reply
    const admins = await db.query(
      'SELECT id FROM users WHERE role="admin" AND status="active"'
    );
    for (const a of admins) {
      await db.query(
        'INSERT IGNORE INTO conversation_members(conversation_id, user_id) VALUES(?,?)',
        [c[0].id, a.id]
      );
    }
    return c[0].id;
  }

  const admins = await db.query(
    'SELECT id FROM users WHERE role="admin" AND status="active" ORDER BY id'
  );
  if (!admins.length) throw ApiError.notFound('No support administrator is available.');

  const r = await db.query(
    'INSERT INTO conversations(type, title, is_pinned) VALUES("support", "ZenjiGO Support", 1)'
  );
  const id = r.insertId;
  await db.query('INSERT INTO conversation_members(conversation_id, user_id) VALUES(?,?)', [
    id,
    userId
  ]);
  for (const a of admins) {
    await db.query('INSERT IGNORE INTO conversation_members(conversation_id, user_id) VALUES(?,?)', [
      id,
      a.id
    ]);
  }
  return id;
}

async function markRead(userId, cid) {
  await ensureSchema();
  const member = await db.query(
    'SELECT 1 FROM conversation_members WHERE conversation_id=? AND user_id=?',
    [cid, userId]
  );
  if (!member.length) throw ApiError.forbidden('You are not a member of this conversation.');
  try {
    await db.query(
      'UPDATE conversation_members SET last_read_at = UTC_TIMESTAMP() WHERE conversation_id=? AND user_id=?',
      [cid, userId]
    );
  } catch (_) {}
  return { conversationId: Number(cid), readAt: new Date().toISOString() };
}

/** Admin: list conversations with participant info + unread for this admin */
async function adminList(adminId) {
  await ensureSchema();
  // Ensure admin is on all support threads
  const supportIds = await db.query(`SELECT id FROM conversations WHERE type='support'`);
  for (const s of supportIds) {
    await db.query(
      'INSERT IGNORE INTO conversation_members(conversation_id, user_id) VALUES(?,?)',
      [s.id, adminId]
    );
  }

  const rows = await db.query(
    `SELECT
       c.id,
       c.type,
       c.ride_id AS rideId,
       c.title,
       c.is_pinned AS isPinned,
       c.created_at AS createdAt,
       c.updated_at AS updatedAt,
       (SELECT m.text FROM messages m WHERE m.conversation_id=c.id AND m.is_deleted=0 ORDER BY m.id DESC LIMIT 1) AS lastMessage,
       (SELECT m.created_at FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) AS lastMessageAt,
       (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id AND m.is_deleted=0) AS messageCount,
       (
         SELECT COUNT(*) FROM messages m
         WHERE m.conversation_id = c.id
           AND m.sender_id <> ?
           AND m.is_deleted = 0
           AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)
       ) AS unreadCount
     FROM conversations c
     LEFT JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
     ORDER BY COALESCE(
       (SELECT m.created_at FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1),
       c.updated_at
     ) DESC
     LIMIT 500`,
    [adminId, adminId]
  );

  for (const row of rows) {
    const members = await db.query(
      `SELECT u.id, u.full_name AS fullName, u.role, u.phone, u.email
       FROM conversation_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.conversation_id = ?`,
      [row.id]
    );
    row.members = members;
    const customer = members.find((m) => m.role === 'rider' || m.role === 'driver');
    row.customerName = customer?.fullName || null;
    row.customerRole = customer?.role || null;
    row.customerId = customer?.id || null;
    if (row.type === 'support') {
      row.title = row.customerName
        ? `Support · ${row.customerName}`
        : row.title || 'ZenjiGO Support';
    }
  }
  return rows;
}

async function adminMessages(adminId, cid) {
  await ensureSchema();
  // Auto-join admin to conversation so they can read/reply
  await db.query(
    'INSERT IGNORE INTO conversation_members(conversation_id, user_id) VALUES(?,?)',
    [cid, adminId]
  );
  return messages(adminId, cid);
}

async function adminSend(adminId, cid, text, replyToId) {
  await ensureSchema();
  await db.query(
    'INSERT IGNORE INTO conversation_members(conversation_id, user_id) VALUES(?,?)',
    [cid, adminId]
  );
  return send(adminId, cid, text, replyToId);
}

async function adminMarkAllSupportRead(adminId) {
  await ensureSchema();
  const support = await db.query(`SELECT id FROM conversations WHERE type='support'`);
  for (const s of support) {
    await db.query(
      'INSERT IGNORE INTO conversation_members(conversation_id, user_id) VALUES(?,?)',
      [s.id, adminId]
    );
    try {
      await db.query(
        'UPDATE conversation_members SET last_read_at = UTC_TIMESTAMP() WHERE conversation_id=? AND user_id=?',
        [s.id, adminId]
      );
    } catch (_) {}
  }
  return { marked: support.length };
}

module.exports = {
  setIo,
  getIo,
  ensureRideConversation,
  list,
  messages,
  send,
  createSupport,
  markRead,
  adminList,
  adminMessages,
  adminSend,
  adminMarkAllSupportRead
};
