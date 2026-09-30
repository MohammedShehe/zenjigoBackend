const db=require('../config/db'); const config=require('../config/env'); const {hashPassword}=require('../utils/hash'); const ApiError=require('../utils/ApiError'); const {ok}=require('../utils/response'); const asyncHandler=require('../utils/asyncHandler'); const {notifyUser}=require('../services/notification.service');
exports.dashboard=asyncHandler(async(req,res)=>{const [[users]]=await Promise.all([db.query('SELECT COUNT(*) n FROM users')]);const [[riders]]=await Promise.all([db.query(`SELECT COUNT(*) n FROM users WHERE role='rider'`)]);const [[drivers]]=await Promise.all([db.query(`SELECT COUNT(*) n FROM users WHERE role='driver'`)]);const [[rides]]=await Promise.all([db.query(`SELECT COUNT(*) n FROM rides WHERE DATE(created_at)=UTC_DATE()`)]);const [[pending]]=await Promise.all([db.query(`SELECT COUNT(*) n FROM driver_profiles WHERE application_status IN ('pending','under_review')`)]);ok(res,{users:users.n,riders:riders.n,drivers:drivers.n,todayRides:rides.n,pendingDriverApplications:pending.n});});
exports.riders=asyncHandler(async(req,res)=>ok(res,await db.query(`SELECT u.id,u.full_name fullName,u.phone,u.email,u.status,u.created_at createdAt,COALESCE(w.balance,0) walletBalance,r.total_rides totalRides,r.rating FROM users u LEFT JOIN wallets w ON w.user_id=u.id LEFT JOIN rider_profiles r ON r.user_id=u.id WHERE u.role='rider' ORDER BY u.id DESC LIMIT 500`)));
exports.drivers=asyncHandler(async(req,res)=>ok(res,await db.query(`SELECT u.id,u.full_name fullName,u.phone,u.email,u.status,u.created_at createdAt,d.driver_code driverCode,d.application_status applicationStatus,d.online,d.rating,d.total_rides totalRides,d.total_earnings totalEarnings,v.type vehicleType,v.plate_number plateNumber FROM users u JOIN driver_profiles d ON d.user_id=u.id LEFT JOIN vehicles v ON v.driver_id=u.id AND v.status='active' WHERE u.role='driver' ORDER BY u.id DESC LIMIT 500`)));
exports.driver=asyncHandler(async(req,res)=>{const u=await db.query(`SELECT u.*,d.*,v.* FROM users u JOIN driver_profiles d ON d.user_id=u.id LEFT JOIN vehicles v ON v.driver_id=u.id AND v.status='active' WHERE u.id=? AND u.role='driver'`,[req.params.id]);if(!u.length)throw ApiError.notFound('Driver not found');const docs=await db.query('SELECT * FROM driver_documents WHERE driver_id=? ORDER BY id DESC',[req.params.id]);ok(res,{profile:u[0],documents:docs});});
exports.driverStatus=asyncHandler(async(req,res)=>{const statuses=['under_review','approved','rejected','active'];if(!statuses.includes(req.body.status))throw ApiError.badRequest('Invalid driver status');await db.transaction(async conn=>{await conn.query('UPDATE driver_profiles SET application_status=?,rejection_reason=?,approved_at=CASE WHEN ? IN ("approved","active") THEN UTC_TIMESTAMP() ELSE approved_at END WHERE user_id=?',[req.body.status,req.body.reason||null,req.body.status,req.params.id]);await conn.query('UPDATE users SET status=? WHERE id=?',[req.body.status==='rejected'?'rejected':'active',req.params.id]);await conn.query('INSERT INTO admin_audit_logs(admin_id,action,entity_type,entity_id,details,ip_address) VALUES(?,?,?,?,?,?)',[req.user.sub,'driver_status','driver',req.params.id,JSON.stringify(req.body),req.ip]);});await notifyUser(req.params.id,'Driver application updated',`Your driver application is now ${req.body.status}.`,'driver_application',{status:req.body.status});ok(res,null,'Driver status updated');});
exports.documentStatus=asyncHandler(async(req,res)=>{await db.query('UPDATE driver_documents SET status=?,rejection_reason=?,verified_by=?,verified_at=UTC_TIMESTAMP() WHERE id=?',[req.body.status,req.body.reason||null,req.user.sub,req.params.id]);ok(res,null,'Document status updated');});
exports.rides=asyncHandler(async(req,res)=>ok(res,await db.query(`SELECT r.*,ru.full_name riderName,du.full_name driverName FROM rides r JOIN users ru ON ru.id=r.rider_id LEFT JOIN users du ON du.id=r.driver_id ORDER BY r.id DESC LIMIT 1000`)));
exports.ride=asyncHandler(async(req,res)=>{const r=await db.query('SELECT r.*,ru.full_name riderName,du.full_name driverName FROM rides r JOIN users ru ON ru.id=r.rider_id LEFT JOIN users du ON du.id=r.driver_id WHERE r.id=?',[req.params.id]);if(!r.length)throw ApiError.notFound('Ride not found');const events=await db.query('SELECT * FROM ride_events WHERE ride_id=? ORDER BY id',[req.params.id]);ok(res,{ride:r[0],events});});
exports.promos=asyncHandler(async(req,res)=>ok(res,await db.query('SELECT * FROM promos ORDER BY id DESC')));
exports.createPromo=asyncHandler(async(req,res)=>{const b=req.body;const r=await db.query('INSERT INTO promos(code,title,description,discount_type,discount_value,max_discount,usage_limit,per_user_limit,valid_from,valid_until,applies_to,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[b.code.toUpperCase(),b.title,b.description||null,b.discountType,b.discountValue,b.maxDiscount||null,b.usageLimit||null,b.perUserLimit||1,b.validFrom,b.validUntil,b.appliesTo||'ride',req.user.sub]);ok(res,{id:r.insertId},'Promo created',201);});
exports.payments=asyncHandler(async(req,res)=>ok(res,await db.query(`SELECT p.*,u.full_name userName,u.phone FROM payment_transactions p JOIN users u ON u.id=p.user_id ORDER BY p.id DESC LIMIT 500`)));
exports.completePayment=asyncHandler(async(req,res)=>{const r=await db.transaction(async conn=>{const [p]=await conn.query('SELECT * FROM payment_transactions WHERE id=? FOR UPDATE',[req.params.id]);if(!p.length)throw ApiError.notFound('Payment not found');if(p[0].status==='success')return p[0];await conn.query('UPDATE payment_transactions SET status="success",external_reference=COALESCE(external_reference,?) WHERE id=?',[req.body.externalReference||`MANUAL-${req.params.id}`,req.params.id]);const [w]=await conn.query('SELECT balance FROM wallets WHERE user_id=? FOR UPDATE',[p[0].user_id]);const before=Number(w[0].balance),after=before+Number(p[0].amount);await conn.query('UPDATE wallets SET balance=? WHERE user_id=?',[after,p[0].user_id]);await conn.query('INSERT INTO wallet_transactions(user_id,type,amount,balance_before,balance_after,reference_type,reference_id,payment_method,description) VALUES(?,?,?,?,?,?,?,?,?)',[p[0].user_id,'topup',p[0].amount,before,after,'payment',p[0].id,p[0].provider,'Wallet top-up']);return p[0];});await notifyUser(r.user_id,'Wallet top-up successful',`TZS ${r.amount} has been added to your wallet.`,'wallet',{paymentId:r.id});ok(res,{id:r.id,status:'success'},'Payment completed');});
exports.payouts=asyncHandler(async(req,res)=>ok(res,await db.query(`SELECT p.*,u.full_name driverName,u.phone FROM payout_requests p JOIN users u ON u.id=p.driver_id ORDER BY p.id DESC LIMIT 500`)));
exports.payoutStatus=asyncHandler(async(req,res)=>{const valid=['approved','paid','rejected'];if(!valid.includes(req.body.status))throw ApiError.badRequest('Invalid payout status');await db.query('UPDATE payout_requests SET status=?,admin_note=?,processed_by=?,processed_at=UTC_TIMESTAMP() WHERE id=?',[req.body.status,req.body.note||null,req.user.sub,req.params.id]);ok(res,null,'Payout updated');});
exports.sendNotification=asyncHandler(async(req,res)=>{const users=req.body.userIds||[];for(const id of users)await notifyUser(id,req.body.title,req.body.body,'admin',req.body.data||{});ok(res,{sent:users.length},'Notifications sent');});
exports.tours=asyncHandler(async(req,res)=>ok(res,await db.query('SELECT * FROM tour_packages ORDER BY id DESC')));
exports.createTour=asyncHandler(async(req,res)=>{const b=req.body;const r=await db.query('INSERT INTO tour_packages(name,description,duration_hours,base_price,max_tourists,pickup_notes,image_url,created_by) VALUES(?,?,?,?,?,?,?,?)',[b.name,b.description||null,b.durationHours||8,b.basePrice,b.maxTourists||4,b.pickupNotes||null,b.imageUrl||null,req.user.sub]);ok(res,{id:r.insertId},'Tour package created',201);});
exports.audit=asyncHandler(async(req,res)=>ok(res,await db.query('SELECT * FROM admin_audit_logs ORDER BY id DESC LIMIT 500')));

exports.settings=asyncHandler(async(req,res)=>ok(res,await db.query('SELECT setting_key,setting_value,updated_at FROM app_settings ORDER BY setting_key')));
exports.updateSetting=asyncHandler(async(req,res)=>{
 const key=req.params.key; const value=req.body.value;
 await db.query(`INSERT INTO app_settings(setting_key,setting_value,updated_by) VALUES(?,?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_by=VALUES(updated_by),updated_at=UTC_TIMESTAMP()`,[key,JSON.stringify(value),req.user.sub]);
 await db.query('INSERT INTO admin_audit_logs(admin_id,action,entity_type,details,ip_address) VALUES(?,?,?,?,?)',[req.user.sub,'setting_update','setting',JSON.stringify({key,value}),req.ip]);
 ok(res,{key,value},'Setting updated');
});
exports.driverFinance=asyncHandler(async(req,res)=>{
 const rows=await db.query(`SELECT u.id,u.full_name fullName,u.phone,f.gross_since_settlement grossSinceSettlement,f.commission_owed commissionOwed,f.lifetime_gross lifetimeGross,f.lifetime_commission lifetimeCommission,f.blocked,f.autopay_enabled autopayEnabled,f.autopay_provider autopayProvider,d.total_earnings totalEarnings FROM driver_financials f JOIN users u ON u.id=f.driver_id JOIN driver_profiles d ON d.user_id=f.driver_id ORDER BY f.commission_owed DESC`);
 ok(res,rows);
});
exports.settleDriver=asyncHandler(async(req,res)=>{
 const finance=require('../services/driver_finance.service');
 const result=await finance.createSettlement(req.params.id,'admin_manual',{adminId:req.user.sub});
 if(result.status==='already_settled') return ok(res,result,'Driver already settled');
 const paid=await finance.markPaid(req.params.id,result.id,req.body.externalReference||`ADMIN-${result.id}`);
 ok(res,paid,'Driver settlement recorded');
});
exports.riderStatus=asyncHandler(async(req,res)=>{
 const status=req.body.status;
 if(!['active','suspended','rejected'].includes(status)) throw ApiError.badRequest('Invalid rider status');
 await db.query('UPDATE users SET status=? WHERE id=? AND role="rider"',[status,req.params.id]);
 ok(res,null,'Rider status updated');
});
exports.createRider=asyncHandler(async(req,res)=>{
 const b=req.body;if(!b.fullName||!b.phone)throw ApiError.badRequest('fullName and phone are required');
 const r=await db.transaction(async conn=>{
  const [u]=await conn.query('INSERT INTO users(role,full_name,phone,email,island,region,district,ward,status) VALUES("rider",?,?,?,?,?,?,?,?)',[b.fullName,b.phone,b.email||null,b.island||null,b.region||null,b.district||null,b.ward||null,b.status||'active']);
  await conn.query('INSERT INTO rider_profiles(user_id,referral_code) VALUES(?,?)',[u.insertId,`ZG${String(u.insertId).padStart(6,'0')}`]);
  await conn.query('INSERT INTO wallets(user_id) VALUES(?)',[u.insertId]);
  return u.insertId;
 });
 ok(res,{id:r},'Rider created',201);
});

exports.commissions=asyncHandler(async(req,res)=>ok(res,await db.query(`SELECT e.id,e.driver_id driverId,u.full_name driverName,e.ride_id rideId,e.gross_amount grossAmount,e.commission_rate commissionRate,e.commission_amount commissionAmount,e.driver_amount driverAmount,e.created_at createdAt FROM driver_earning_ledger e JOIN users u ON u.id=e.driver_id ORDER BY e.id DESC LIMIT 1000`)));
exports.commissionSettings=asyncHandler(async(req,res)=>ok(res,{cycleLimit:Number(process.env.DRIVER_SETTLEMENT_THRESHOLD_TZS||60000),percent:Number(process.env.DRIVER_COMMISSION_PERCENT||20),currency:config.ride.currency}));
exports.updateCommissionSettings=asyncHandler(async(req,res)=>{
 const cycle=Number(req.body.cycleLimit),percent=Number(req.body.percent);
 if(!Number.isFinite(cycle)||cycle<=0||!Number.isFinite(percent)||percent<0||percent>100) throw ApiError.badRequest('Invalid commission settings.');
 await db.query(`INSERT INTO app_settings(setting_key,setting_value,updated_by) VALUES(?,?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_by=VALUES(updated_by),updated_at=UTC_TIMESTAMP()`,['driver_commission_cycle',JSON.stringify(cycle),req.user.sub]);
 await db.query(`INSERT INTO app_settings(setting_key,setting_value,updated_by) VALUES(?,?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_by=VALUES(updated_by),updated_at=UTC_TIMESTAMP()`,['driver_commission_percent',JSON.stringify(percent),req.user.sub]);
 ok(res,{cycleLimit:cycle,percent},'Commission settings saved');
});
exports.parcels=asyncHandler(async(req,res)=>ok(res,await db.query(`SELECT p.*,ru.full_name riderName,du.full_name driverName FROM parcels p JOIN users ru ON ru.id=p.rider_id LEFT JOIN users du ON du.id=p.driver_id ORDER BY p.id DESC LIMIT 1000`)));
exports.notifications=asyncHandler(async(req,res)=>ok(res,await db.query(`SELECT n.*,u.full_name userName FROM notifications n LEFT JOIN users u ON u.id=n.user_id ORDER BY n.id DESC LIMIT 500`)));
exports.conversations=asyncHandler(async(req,res)=>ok(res,await db.query(`SELECT c.*,COUNT(cm.id) messageCount FROM conversations c LEFT JOIN messages cm ON cm.conversation_id=c.id GROUP BY c.id ORDER BY c.updated_at DESC LIMIT 500`)));
