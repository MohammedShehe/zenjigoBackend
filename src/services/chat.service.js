const db=require('../config/db'); const ApiError=require('../utils/ApiError'); const {sendPush}=require('../config/firebase');
async function ensureRideConversation(userId,rideId){
 const r=await db.query('SELECT rider_id,driver_id FROM rides WHERE id=?',[rideId]);if(!r.length)throw ApiError.notFound('Ride not found');
 const ids=[r[0].rider_id,r[0].driver_id].filter(Boolean);if(!ids.includes(userId))throw ApiError.forbidden('You are not part of this ride.');
 let c=await db.query('SELECT id FROM conversations WHERE ride_id=? AND type="ride" LIMIT 1',[rideId]);
 let id;
 if(c.length)id=c[0].id; else {const x=await db.query('INSERT INTO conversations(type,ride_id,title) VALUES("ride",?,"Ride chat")',[rideId]);id=x.insertId;for(const uid of ids)await db.query('INSERT INTO conversation_members(conversation_id,user_id) VALUES(?,?)',[id,uid]);}
 return id;
}
async function list(userId){return db.query(`SELECT c.id,c.type,c.ride_id rideId,c.title,c.is_pinned isPinned,c.updated_at updatedAt,(SELECT text FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) lastMessage,(SELECT created_at FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) lastMessageAt FROM conversations c JOIN conversation_members cm ON cm.conversation_id=c.id WHERE cm.user_id=? ORDER BY COALESCE(lastMessageAt,c.updated_at) DESC`,[userId]);}
async function messages(userId,cid){
 const m=await db.query('SELECT id,sender_id senderId,text,reply_to_id replyToId,is_edited isEdited,is_deleted isDeleted,created_at createdAt FROM messages WHERE conversation_id=? AND EXISTS(SELECT 1 FROM conversation_members WHERE conversation_id=? AND user_id=?) ORDER BY id ASC',[cid,cid,userId]);
 return m;
}
async function send(userId,cid,text,replyToId){
 const member=await db.query('SELECT 1 FROM conversation_members WHERE conversation_id=? AND user_id=?',[cid,userId]);if(!member.length)throw ApiError.forbidden('You are not a member of this conversation.');
 const r=await db.query('INSERT INTO messages(conversation_id,sender_id,text,reply_to_id) VALUES(?,?,?,?)',[cid,userId,text,replyToId||null]);
 const msg=(await db.query('SELECT * FROM messages WHERE id=?',[r.insertId]))[0];
 const other=await db.query('SELECT user_id FROM conversation_members WHERE conversation_id=? AND user_id<>?',[cid,userId]);
 const tokens=other.length?await db.query(`SELECT token FROM device_tokens WHERE user_id IN (${other.map(()=>'?').join(',')})`,other.map(x=>x.user_id)):[];
 await sendPush(tokens.map(x=>x.token),{title:'New message',body:text.slice(0,120)},{type:'chat',conversationId:cid});
 return msg;
}
async function createSupport(userId){
 let c=await db.query(`SELECT c.id FROM conversations c JOIN conversation_members cm ON cm.conversation_id=c.id WHERE c.type='support' AND cm.user_id=? LIMIT 1`,[userId]);if(c.length)return c[0].id;
 const admin=await db.query('SELECT id FROM users WHERE role="admin" AND status="active" ORDER BY id LIMIT 1'); if(!admin.length)throw ApiError.notFound('No support administrator is available.');
 const r=await db.query('INSERT INTO conversations(type,title,is_pinned) VALUES("support","ZenjiGO Support",1)');const id=r.insertId;
 await db.query('INSERT INTO conversation_members(conversation_id,user_id) VALUES(?,?),(?,?)',[id,userId,id,admin[0].id]);return id;
}
module.exports={ensureRideConversation,list,messages,send,createSupport};
