const crypto=require('crypto');
const db=require('../config/db');
const ApiError=require('../utils/ApiError');
const config=require('../config/env');
function verifySignature(raw,signature){
 const secret=process.env.PAYMENT_WEBHOOK_SECRET||'CHANGE_ME_PAYMENT_WEBHOOK_SECRET';
 if(!signature) return false;
 const expected=crypto.createHmac('sha256',secret).update(raw).digest('hex');
 return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(String(signature)));
}
async function completeWalletTopup(paymentId,externalReference,provider='configured'){
 return db.transaction(async conn=>{
  const [rows]=await conn.query('SELECT * FROM payment_transactions WHERE id=? FOR UPDATE',[paymentId]);
  if(!rows.length) throw ApiError.notFound('Payment transaction not found.');
  const p=rows[0]; if(p.status==='success') return p;
  await conn.query(`UPDATE payment_transactions SET status='success',external_reference=COALESCE(?,external_reference),provider=? WHERE id=?`,[externalReference,provider,paymentId]);
  const [w]=await conn.query('SELECT balance FROM wallets WHERE user_id=? FOR UPDATE',[p.user_id]);
  const before=Number(w?.[0]?.balance||0),after=before+Number(p.amount);
  if(w.length) await conn.query('UPDATE wallets SET balance=? WHERE user_id=?',[after,p.user_id]);
  else await conn.query('INSERT INTO wallets(user_id,balance) VALUES(?,?)',[p.user_id,after]);
  await conn.query(`INSERT INTO wallet_transactions(user_id,type,amount,balance_before,balance_after,reference_type,reference_id,payment_method,description) VALUES(?,?,?,?,?,?,?,?,?)`,
   [p.user_id,'topup',p.amount,before,after,'payment',p.id,provider,'Wallet top-up']);
  return p;
 });
}
module.exports={verifySignature,completeWalletTopup};
