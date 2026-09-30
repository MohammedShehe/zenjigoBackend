const db=require('../config/db'); const {sendPush}=require('../config/firebase');
async function notifyUser(userId,title,body,type='system',data={}){
 const r=await db.query('INSERT INTO notifications(user_id,type,title,body,data) VALUES(?,?,?,?,?)',[userId,type,title,body,JSON.stringify(data)]);
 const t=await db.query('SELECT token FROM device_tokens WHERE user_id=?',[userId]); await sendPush(t.map(x=>x.token),{title,body},data); return r.insertId;
}
module.exports={notifyUser};
