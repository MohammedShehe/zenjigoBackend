const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { randomToken, hashToken } = require('./hash');
const db = require('../config/db');
function signAccess(payload){ return jwt.sign(payload, config.jwt.accessSecret, {expiresIn:config.jwt.accessExpires,issuer:'zenjigo'}); }
function verifyAccess(token){ return jwt.verify(token, config.jwt.accessSecret, {issuer:'zenjigo'}); }
async function issueRefreshToken(userId, role){
  const raw = randomToken(48), hash = hashToken(raw);
  const ms = 30*24*60*60*1000;
  await db.query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY))',[userId,hash]);
  return raw;
}
async function rotateRefreshToken(raw){
  const hash=hashToken(raw);
  const rows=await db.query('SELECT rt.id,rt.user_id,rt.expires_at,u.role,u.status FROM refresh_tokens rt JOIN users u ON u.id=rt.user_id WHERE rt.token_hash=? AND rt.revoked_at IS NULL LIMIT 1',[hash]);
  if(!rows.length || new Date(rows[0].expires_at)<=new Date() || rows[0].status!=='active') return null;
  await db.query('UPDATE refresh_tokens SET revoked_at=UTC_TIMESTAMP() WHERE id=?',[rows[0].id]);
  const access=signAccess({sub:rows[0].user_id,role:rows[0].role});
  const refresh=await issueRefreshToken(rows[0].user_id,rows[0].role);
  return {accessToken:access,refreshToken:refresh,userId:rows[0].user_id,role:rows[0].role};
}
async function revokeRefresh(raw){await db.query('UPDATE refresh_tokens SET revoked_at=UTC_TIMESTAMP() WHERE token_hash=?',[hashToken(raw)]);}
module.exports={signAccess,verifyAccess,issueRefreshToken,rotateRefreshToken,revokeRefresh};
