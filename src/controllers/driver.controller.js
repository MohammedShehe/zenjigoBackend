const s=require('../services/driver.service'); const ride=require('../services/ride.service'); const {ok}=require('../utils/response'); const asyncHandler=require('../utils/asyncHandler'); const db=require('../config/db'); const finance=require('../services/driver_finance.service');
exports.register=asyncHandler(async(req,res)=>ok(res,await s.register(req.body,req.files),'Application submitted',201));
exports.profile=asyncHandler(async(req,res)=>ok(res,await s.profile(req.user.sub)));
exports.documents=asyncHandler(async(req,res)=>ok(res,await s.documents(req.user.sub)));
exports.online=asyncHandler(async(req,res)=>{
 if(req.body.online) await finance.assertUsable(req.user.sub,'go online');
 ok(res,await s.setOnline(req.user.sub,req.body.online),'Availability updated');
});
exports.location=asyncHandler(async(req,res)=>ok(res,await s.location(req.user.sub,req.body)));
exports.earnings=asyncHandler(async(req,res)=>ok(res,await s.earnings(req.user.sub,req.query.from,req.query.to)));
exports.payout=asyncHandler(async(req,res)=>ok(res,await s.payout(req.user.sub,req.body),'Payout requested',201));
exports.requests=asyncHandler(async(req,res)=>{
 const f=await finance.getStatus(req.user.sub);
 const rows=await db.query(`SELECT r.id,r.ride_code,r.ride_type,r.pickup_address,r.destination_address,r.pickup_lat,r.pickup_lng,r.destination_lat,r.destination_lng,r.estimated_fare,r.estimated_distance_km,r.estimated_duration_min,r.created_at FROM rides r WHERE r.status='searching' AND r.ride_type IN (SELECT type FROM vehicles WHERE driver_id=? AND status='active') ORDER BY r.created_at DESC LIMIT 30`,[req.user.sub]);
 if(f.blocked || f.grossSinceSettlement>=finance.THRESHOLD){
   return ok(res,{restricted:true,settlementRequired:true,commissionOwed:f.commissionOwed,threshold:finance.THRESHOLD,requests:rows.map(r=>({id:r.id,ride_code:r.ride_code,ride_type:r.ride_type,pickup_lat:r.pickup_lat,pickup_lng:r.pickup_lng,estimated_distance_km:r.estimated_distance_km,created_at:r.created_at,masked:true}))});
 }
 ok(res,{restricted:false,settlementRequired:false,requests:rows});
});
exports.accept=asyncHandler(async(req,res)=>ok(res,await ride.accept(req.user.sub,req.params.id),'Ride accepted'));
exports.status=asyncHandler(async(req,res)=>ok(res,await ride.setStatus(req.user.sub,req.params.id,req.body.status),'Ride status updated'));
exports.history=asyncHandler(async(req,res)=>ok(res,await ride.listForUser(req.user.sub,'driver',req.query.limit)));

exports.finance=asyncHandler(async(req,res)=>ok(res,await finance.getStatus(req.user.sub)));
exports.settlement=asyncHandler(async(req,res)=>ok(res,await finance.createSettlement(req.user.sub,req.body.provider||'example',req.body.metadata||{}),'Settlement created',201));
exports.markSettlementPaid=asyncHandler(async(req,res)=>ok(res,await finance.markPaid(req.user.sub,req.params.id,req.body.externalReference),'Settlement recorded'));
exports.autopay=asyncHandler(async(req,res)=>{ const result=await finance.configureAutopay(req.user.sub,Boolean(req.body.enabled),req.body.provider,req.body.providerToken,req.body.metadata||{}); if(req.body.enabled){ const auto=await finance.tryAutopay(req.user.sub); return ok(res,{finance:result,autopayAttempt:auto},'Autopay updated'); } ok(res,result,'Autopay updated'); });
exports.paymentMethods=asyncHandler(async(req,res)=>ok(res,await db.query('SELECT id,provider,method_type,account_label,masked_account,is_autopay_default,created_at FROM driver_payment_methods WHERE driver_id=? ORDER BY id DESC',[req.user.sub])));
exports.addPaymentMethod=asyncHandler(async(req,res)=>ok(res,await finance.addPaymentMethod(req.user.sub,req.body),'Payment method added',201));
exports.removePaymentMethod=asyncHandler(async(req,res)=>{await db.query('UPDATE driver_payment_methods SET active=0,is_autopay_default=0 WHERE id=? AND driver_id=?',[req.params.id,req.user.sub]);ok(res,null,'Payment method removed');});
