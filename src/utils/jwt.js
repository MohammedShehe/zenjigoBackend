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
  if(!raw || typeof raw!=='string') return null;
  const hash=hashToken(raw);
  const rows=await db.query('SELECT rt.id,rt.user_id,rt.expires_at,rt.revoked_at,u.role,u.status FROM refresh_tokens rt JOIN users u ON u.id=rt.user_id WHERE rt.token_hash=? LIMIT 1',[hash]);
  if(!rows.length) return null;
  const row=rows[0];
  // Reuse detection: a token that was already rotated/revoked is being replayed. Treat the whole
  // token family as compromised and revoke every live refresh token for that user.
  if(row.revoked_at){
    await db.query('UPDATE refresh_tokens SET revoked_at=UTC_TIMESTAMP() WHERE user_id=? AND revoked_at IS NULL',[row.user_id]);
    console.warn(JSON.stringify({evt:'auth.refresh_reuse_detected',userId:row.user_id}));
    return null;
  }
  if(new Date(row.expires_at)<=new Date()) return null;
  if(['suspended','rejected','banned'].includes(row.status)) return null;
  const claimed=await db.query('UPDATE refresh_tokens SET revoked_at=UTC_TIMESTAMP() WHERE id=? AND revoked_at IS NULL',[row.id]);
  if(!claimed.affectedRows) return null; // lost a concurrent race
  const access=signAccess({sub:row.user_id,role:row.role});
  const refresh=await issueRefreshToken(row.user_id,row.role);
  return {accessToken:access,refreshToken:refresh,userId:row.user_id,role:row.role};
}
async function revokeRefresh(raw){ if(!raw) return; await db.query('UPDATE refresh_tokens SET revoked_at=UTC_TIMESTAMP() WHERE token_hash=?',[hashToken(raw)]);}
module.exports={signAccess,verifyAccess,issueRefreshToken,rotateRefreshToken,revokeRefresh,revokeRefreshToken:revokeRefresh};
