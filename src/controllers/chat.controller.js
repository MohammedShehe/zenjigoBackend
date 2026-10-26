const s = require('../services/chat.service');
const { ok } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

exports.list = asyncHandler(async (req, res) => ok(res, await s.list(req.user.sub)));

exports.support = asyncHandler(async (req, res) => {
  const conversationId = await s.createSupport(req.user.sub);
  ok(res, { conversationId, id: conversationId }, 'Support chat ready');
});

exports.ride = asyncHandler(async (req, res) => {
  const conversationId = await s.ensureRideConversation(req.user.sub, req.params.rideId);
  ok(res, { conversationId, id: conversationId });
});

exports.messages = asyncHandler(async (req, res) =>
  ok(res, await s.messages(req.user.sub, req.params.id))
);

exports.send = asyncHandler(async (req, res) => {
  if (!req.body.text?.trim()) throw ApiError.badRequest('Message text is required');
  ok(
    res,
    await s.send(req.user.sub, req.params.id, req.body.text.trim(), req.body.replyToId),
    'Message sent',
    201
  );
});

exports.edit = asyncHandler(async (req, res) => {
  const db = require('../config/db');
  const text = String(req.body.text || '').trim();
  if (!text) throw ApiError.badRequest('Message text is required');
  const r = await db.query(
    'UPDATE messages SET text=?, is_edited=1 WHERE id=? AND conversation_id=? AND sender_id=? AND is_deleted=0',
    [text, req.params.messageId, req.params.id, req.user.sub]
  );
  if (!r.affectedRows) throw ApiError.notFound('Message not found');
  ok(res, { id: Number(req.params.messageId), text, isEdited: true }, 'Message updated');
});

exports.delete = asyncHandler(async (req, res) => {
  await require('../config/db').query(
    'UPDATE messages SET is_deleted=1, text="[deleted]" WHERE id=? AND sender_id=?',
    [req.params.messageId, req.user.sub]
  );
  ok(res, null, 'Message deleted');
});

exports.markRead = asyncHandler(async (req, res) =>
  ok(res, await s.markRead(req.user.sub, req.params.id), 'Conversation marked as read')
);
