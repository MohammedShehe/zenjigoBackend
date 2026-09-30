const db=require('../config/db'); const ApiError=require('../utils/ApiError'); const {ok}=require('../utils/response'); const asyncHandler=require('../utils/asyncHandler');
exports.me=asyncHandler(async(req,res)=>{
 const rows=await db.query(`SELECT u.*,COALESCE(w.balance,0) wallet_balance,rp.referral_code,rp.rating,rp.total_rides FROM users u LEFT JOIN wallets w ON w.user_id=u.id LEFT JOIN rider_profiles rp ON rp.user_id=u.id WHERE u.id=?`,[req.user.sub]);
 if(!rows.length) throw ApiError.notFound('User not found');
 const u=rows[0]; delete u.password_hash; ok(res,{...u,walletBalance:Number(u.wallet_balance)});
});
exports.update=asyncHandler(async(req,res)=>{
 const fields=['full_name','email','photo_url','island','region','district','ward'];
 const sets=[],vals=[];
 const map={fullName:'full_name',email:'email',photoUrl:'photo_url',island:'island',region:'region',district:'district',ward:'ward'};
 for(const [k,col] of Object.entries(map)) if(req.body[k]!==undefined){sets.push(`${col}=?`);vals.push(req.body[k]);}
 if(!sets.length) return exports.me(req,res);
 vals.push(req.user.sub); await db.query(`UPDATE users SET ${sets.join(',')} WHERE id=?`,vals); return exports.me(req,res);
});
exports.savedList=asyncHandler(async(req,res)=>ok(res,await db.query('SELECT id,label,address,island,region,district,ward,lat,lng,created_at FROM saved_locations WHERE user_id=? ORDER BY id DESC',[req.user.sub])));
exports.savedCreate=asyncHandler(async(req,res)=>{
 const b=req.body; if(!b.label||!b.address) throw ApiError.badRequest('label and address are required');
 const r=await db.query('INSERT INTO saved_locations(user_id,label,address,island,region,district,ward,lat,lng) VALUES(?,?,?,?,?,?,?,?,?)',[req.user.sub,b.label,b.address,b.island||null,b.region||null,b.district||null,b.ward||null,b.lat??null,b.lng??null]);
 ok(res,{id:r.insertId},'Location saved',201);
});
exports.savedDelete=asyncHandler(async(req,res)=>{await db.query('DELETE FROM saved_locations WHERE id=? AND user_id=?',[req.params.id,req.user.sub]);ok(res,null,'Location removed');});
exports.paymentMethods=asyncHandler(async(req,res)=>ok(res,await db.query('SELECT id,type,provider,account_number accountNumber,card_last4 cardLast4,card_brand cardBrand,expiry_month expiryMonth,expiry_year expiryYear,card_holder cardHolder,is_default isDefault FROM payment_methods WHERE user_id=? ORDER BY is_default DESC,id DESC',[req.user.sub])));
exports.paymentCreate=asyncHandler(async(req,res)=>{
 const b=req.body; if(!['cash','momo','bank','wallet','card'].includes(b.type)) throw ApiError.badRequest('Invalid payment method');
 const r=await db.query('INSERT INTO payment_methods(user_id,type,provider,account_number,card_last4,card_brand,expiry_month,expiry_year,card_holder,is_default) VALUES(?,?,?,?,?,?,?,?,?,?)',[req.user.sub,b.type,b.provider||null,b.accountNumber||null,b.cardLast4||null,b.cardBrand||null,b.expiryMonth||null,b.expiryYear||null,b.cardHolder||null,b.isDefault?1:0]);
 if(b.isDefault) await db.query('UPDATE payment_methods SET is_default=0 WHERE user_id=? AND id<>?',[req.user.sub,r.insertId]);
 ok(res,{id:r.insertId},'Payment method added',201);
});
exports.paymentDefault=asyncHandler(async(req,res)=>{const exists=await db.query('SELECT id FROM payment_methods WHERE id=? AND user_id=?',[req.params.id,req.user.sub]);if(!exists.length)throw ApiError.notFound('Payment method not found');await db.query('UPDATE payment_methods SET is_default=(id=?) WHERE user_id=?',[req.params.id,req.user.sub]);ok(res,null,'Default payment method updated');});
exports.paymentDelete=asyncHandler(async(req,res)=>{await db.query('DELETE FROM payment_methods WHERE id=? AND user_id=?',[req.params.id,req.user.sub]);ok(res,null,'Payment method removed');});

exports.deviceToken=asyncHandler(async(req,res)=>{
 if(!req.body.token) throw ApiError.badRequest('FCM token is required.');
 await db.query(`INSERT INTO device_tokens(user_id,token,platform) VALUES(?,?,?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),platform=VALUES(platform),updated_at=UTC_TIMESTAMP()`,[req.user.sub,req.body.token,req.body.platform||'unknown']);
 ok(res,null,'Device registered');
});
exports.removeDeviceToken=asyncHandler(async(req,res)=>{if(!req.body.token)throw ApiError.badRequest('FCM token is required.');await db.query('DELETE FROM device_tokens WHERE user_id=? AND token=?',[req.user.sub,req.body.token]);ok(res,null,'Device removed');});
