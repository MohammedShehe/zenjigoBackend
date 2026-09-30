const db=require('../config/db'); const ApiError=require('../utils/ApiError'); const config=require('../config/env'); const {sendPush}=require('../config/firebase'); const finance=require('./driver_finance.service');
function haversine(a,b,c,d){const R=6371,rad=Math.PI/180;const dLat=(c-a)*rad,dLon=(d-b)*rad;const x=Math.sin(dLat/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
function fare({rideType,distanceKm,durationMin}){const multiplier=rideType==='boda'?1:rideType==='bajaji'?1.15:1.5;return Math.round((config.ride.baseFare+distanceKm*config.ride.perKm+durationMin*config.ride.perMinute+config.ride.bookingFee)*multiplier);}
function code(prefix='ZG'){return `${prefix}${Date.now().toString(36).toUpperCase().slice(-7)}${Math.floor(Math.random()*1000).toString().padStart(3,'0')}`;}
async function quote(input){const distanceKm=haversine(input.pickupLat,input.pickupLng,input.destinationLat,input.destinationLng);const durationMin=Math.max(5,Math.round(distanceKm/0.45));const estimatedFare=fare({rideType:input.rideType,distanceKm,durationMin});return {distanceKm:Number(distanceKm.toFixed(2)),durationMin,estimatedFare,currency:config.ride.currency};}
async function create(riderId,input){
 if(!['boda','bajaji','taxi'].includes(input.rideType)) throw ApiError.badRequest('Invalid ride type');
 const q=await quote(input);
 const tripPin=Math.floor(1000+Math.random()*9000).toString();
 let discount=0;
 let cancellationFee=0;
 const debtRow=await db.query('SELECT cancellation_debt FROM rider_profiles WHERE user_id=?',[riderId]);
 if(debtRow.length) cancellationFee=Math.max(0,Number(debtRow[0].cancellation_debt||0));
 if(input.promoCode){
   const p=await db.query(`SELECT * FROM promos WHERE code=? AND is_active=1 AND valid_from<=UTC_TIMESTAMP() AND valid_until>=UTC_TIMESTAMP() LIMIT 1`,[input.promoCode.toUpperCase()]);
   if(!p.length) throw ApiError.badRequest('Promo code is invalid or expired.');
   const used=await db.query('SELECT COUNT(*) n FROM promo_redemptions WHERE promo_id=? AND user_id=?',[p[0].id,riderId]);
   if(used[0].n>=p[0].per_user_limit) throw ApiError.badRequest('Promo usage limit reached for this rider.');
   discount=p[0].discount_type==='percent'?q.estimatedFare*Number(p[0].discount_value)/100:Number(p[0].discount_value);
   if(p[0].max_discount) discount=Math.min(discount,Number(p[0].max_discount));
   discount=Math.min(discount,q.estimatedFare);
 }
 const r=await db.query(`INSERT INTO rides(ride_code,rider_id,ride_type,pickup_address,pickup_lat,pickup_lng,destination_address,destination_lat,destination_lng,estimated_distance_km,estimated_duration_min,estimated_fare,discount,cancellation_fee,payment_method,promo_code,trip_pin) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
 [code(),riderId,input.rideType,input.pickupAddress,input.pickupLat,input.pickupLng,input.destinationAddress,input.destinationLat,input.destinationLng,q.distanceKm,q.durationMin,q.estimatedFare,discount,cancellationFee,input.paymentMethod||'cash',input.promoCode?.toUpperCase()||null,tripPin]);
 await db.query('INSERT INTO ride_events(ride_id,actor_id,event_type,payload) VALUES(?,?,?,?)',[r.insertId,riderId,'requested',JSON.stringify({quote:q,cancellationFee})]);
 if(cancellationFee>0) await db.query('UPDATE rider_profiles SET cancellation_debt=0 WHERE user_id=?',[riderId]);
 await notifyAvailableDrivers(r.insertId,input.rideType,input.pickupLat,input.pickupLng);
 return getById(r.insertId,riderId);
}
async function notifyAvailableDrivers(rideId,rideType,lat,lng){
 const drivers=await db.query(`SELECT d.user_id,u.full_name FROM driver_profiles d JOIN users u ON u.id=d.user_id LEFT JOIN driver_locations l ON l.driver_id=d.user_id AND l.id=(SELECT MAX(id) FROM driver_locations WHERE driver_id=d.user_id) JOIN vehicles v ON v.driver_id=d.user_id AND v.status='active' AND v.type=? WHERE d.online=1 AND d.application_status='active' AND u.status='active' GROUP BY d.user_id LIMIT 30`,[rideType]);
 const tokens=drivers.length?await db.query(`SELECT token FROM device_tokens WHERE user_id IN (${drivers.map(()=>'?').join(',')})`,drivers.map(x=>x.user_id)):[]; await sendPush(tokens.map(x=>x.token),{title:'New ride request',body:'A rider nearby is requesting a ride.'},{type:'ride_request',rideId});
}
async function getById(id,userId=null){
 const rows=await db.query(`SELECT r.*,ru.full_name rider_name,ru.phone rider_phone,du.full_name driver_name,du.phone driver_phone,du.photo_url driver_photo,v.type vehicle_type,v.plate_number vehicle_number,d.rating driver_rating,d.total_rides driver_total_rides FROM rides r JOIN users ru ON ru.id=r.rider_id LEFT JOIN users du ON du.id=r.driver_id LEFT JOIN driver_profiles d ON d.user_id=r.driver_id LEFT JOIN vehicles v ON v.id=r.vehicle_id WHERE r.id=?`,[id]);
 if(!rows.length || (userId && rows[0].rider_id!==userId && rows[0].driver_id!==userId)) throw ApiError.notFound('Ride not found');
 const x=rows[0]; return {...x,estimated_fare:Number(x.estimated_fare),final_fare:x.final_fare==null?null:Number(x.final_fare),discount:Number(x.discount),tip:Number(x.tip),total_paid:Number(x.total_paid)};
}
async function listForUser(userId,role,limit=30){
 const col=role==='driver'?'r.driver_id':'r.rider_id'; return db.query(`SELECT r.*,du.full_name driver_name,du.photo_url driver_photo,v.type vehicle_type,v.plate_number vehicle_number FROM rides r LEFT JOIN users du ON du.id=r.driver_id LEFT JOIN vehicles v ON v.id=r.vehicle_id WHERE ${col}=? ORDER BY r.created_at DESC LIMIT ?`,[userId,Math.min(Number(limit)||30,100)]);
}
async function accept(driverId,rideId){
 await finance.assertUsable(driverId,'accept new rides');
 return db.transaction(async conn=>{
  const [rides]=await conn.query(`SELECT * FROM rides WHERE id=? FOR UPDATE`,[rideId]);
  if(!rides.length) throw ApiError.notFound('Ride not found');
  const r=rides[0]; if(r.status!=='searching') throw ApiError.conflict('Ride is no longer available.');
  const [dp]=await conn.query(`SELECT d.*,v.id vehicle_id FROM driver_profiles d JOIN vehicles v ON v.driver_id=d.user_id AND v.status='active' AND v.type=? WHERE d.user_id=? AND d.online=1 AND d.application_status='active' LIMIT 1 FOR UPDATE`,[r.ride_type,driverId]);
  if(!dp.length) throw ApiError.forbidden('Driver is not online or has no active matching vehicle.');
  await conn.query(`UPDATE rides SET driver_id=?,vehicle_id=?,status='accepted',accepted_at=UTC_TIMESTAMP() WHERE id=? AND status='searching'`,[driverId,dp[0].vehicle_id,rideId]);
  await conn.query('INSERT INTO ride_events(ride_id,actor_id,event_type) VALUES(?,?,?)',[rideId,driverId,'accepted']);
  const rider=(await conn.query('SELECT rider_id FROM rides WHERE id=?',[rideId]))[0][0];
  await pushUser(rider.rider_id,'Driver assigned','Your ZenjiGO driver accepted the ride.',{type:'ride_status',rideId});
  return getById(rideId,driverId);
 });
}
async function setStatus(driverId,rideId,status){
 if(status!=='completed' && status!=='cancelled') await finance.assertUsable(driverId,'continue accepting rides');
 const allowed={arriving:['accepted'],arrived:['arriving'],started:['arrived'],completed:['started'],cancelled:['accepted','arriving','arrived']};
 const result=await db.transaction(async conn=>{
  const [rows]=await conn.query('SELECT * FROM rides WHERE id=? AND driver_id=? FOR UPDATE',[rideId,driverId]);
  if(!rows.length) throw ApiError.notFound('Ride not found');
  const r=rows[0];
  if(!allowed[status]?.includes(r.status)) throw ApiError.conflict(`Cannot change ride from ${r.status} to ${status}.`);
  if(status==='completed' && !r.started_at) throw ApiError.conflict('Ride has not started.');
  let sql='UPDATE rides SET status=?'; const vals=[status];
  if(status==='arriving') sql+=',accepted_at=COALESCE(accepted_at,UTC_TIMESTAMP())';
  if(status==='arrived') sql+=',arrived_at=UTC_TIMESTAMP()';
  if(status==='started') sql+=',started_at=UTC_TIMESTAMP()';
  if(status==='completed') sql+=',completed_at=UTC_TIMESTAMP(),final_fare=GREATEST(0,estimated_fare-discount),total_paid=GREATEST(0,estimated_fare-discount+cancellation_fee+tip)';
  if(status==='cancelled'){sql+=',cancelled_at=UTC_TIMESTAMP(),cancel_reason=?'; vals.push('Cancelled by driver');}
  sql+=' WHERE id=?'; vals.push(rideId);
  await conn.query(sql,vals);
  await conn.query('INSERT INTO ride_events(ride_id,actor_id,event_type) VALUES(?,?,?)',[rideId,driverId,status]);
  const rider=r.rider_id;
  if(status==='completed'){
    const total=Math.max(0,Number(r.estimated_fare)-Number(r.discount)+Number(r.cancellation_fee||0)+Number(r.tip||0));
    if(r.payment_method==='wallet'){
      const [w]=await conn.query('SELECT balance FROM wallets WHERE user_id=? FOR UPDATE',[rider]);
      if(!w.length || Number(w[0].balance)<total) throw ApiError.badRequest('Rider wallet balance is insufficient.');
      const before=Number(w[0].balance), after=before-total;
      await conn.query('UPDATE wallets SET balance=? WHERE user_id=?',[after,rider]);
      await conn.query('INSERT INTO wallet_transactions(user_id,type,amount,balance_before,balance_after,reference_type,reference_id,payment_method,description) VALUES(?,?,?,?,?,?,?,?,?)',[rider,'ride',-total,before,after,'ride',rideId,'wallet','Ride payment']);
    }
    await finance.recordRideEarning(conn,driverId,total,rideId);
    if(Number(r.cancellation_fee||0)>0){
      await conn.query('UPDATE rider_cancellation_debts SET amount=GREATEST(0,amount-?),updated_at=UTC_TIMESTAMP() WHERE rider_id=?',[Number(r.cancellation_fee),rider]);
      await conn.query('UPDATE rider_profiles SET cancellation_debt=GREATEST(0,cancellation_debt-?) WHERE user_id=?',[Number(r.cancellation_fee),rider]);
    }
    await conn.query('UPDATE rider_profiles SET total_rides=total_rides+1 WHERE user_id=?',[rider]);
  }
  await pushUser(rider,status==='completed'?'Ride completed':`Ride ${status}`,status==='completed'?'Your ride is complete.':`Your driver status is now ${status}.`,{type:'ride_status',rideId});
  return getById(rideId,driverId);
 });
 if(status==='completed'){
   const financeStatus=await finance.getStatus(driverId);
   if(financeStatus.blocked && financeStatus.autopayEnabled) await finance.tryAutopay(driverId);
 }
 return result;
}
async function cancelRider(riderId,rideId,reason){
 const r=await db.query(`SELECT r.*,d.current_lat,d.current_lng FROM rides r LEFT JOIN driver_profiles d ON d.user_id=r.driver_id WHERE r.id=? AND r.rider_id=?`,[rideId,riderId]);
 if(!r.length)throw ApiError.notFound('Ride not found');
 if(!['searching','accepted','arriving','arrived'].includes(r[0].status))throw ApiError.conflict('This ride cannot be cancelled now.');
 const x=r[0];
 let fee=0,near=false;
 if(x.driver_id && x.current_lat!=null && x.current_lng!=null){
   const km=finance.haversine(Number(x.current_lat),Number(x.current_lng),Number(x.pickup_lat),Number(x.pickup_lng));
   near=km<=finance.NEAR_RADIUS || x.status==='arrived';
   if(near) fee=Math.round(Number(x.estimated_fare)*finance.CANCEL_PERCENT/100);
 }
 await db.transaction(async conn=>{
   await conn.query('UPDATE rides SET status="cancelled",cancel_reason=?,cancellation_fee=?,cancellation_fee_applied=?,cancelled_at=UTC_TIMESTAMP() WHERE id=?',
     [reason||'Cancelled by rider',fee,fee>0?1:0,rideId]);
   if(fee>0){
     await conn.query(`INSERT INTO rider_cancellation_debts(rider_id,amount,last_ride_id) VALUES(?,?,?) ON DUPLICATE KEY UPDATE amount=amount+VALUES(amount),last_ride_id=VALUES(last_ride_id)`,
       [riderId,fee,rideId]);
     await conn.query('UPDATE rider_profiles SET cancellation_debt=cancellation_debt+? WHERE user_id=?',[fee,riderId]);
   }
   await conn.query('INSERT INTO ride_events(ride_id,actor_id,event_type,payload) VALUES(?,?,?,?)',[rideId,riderId,'cancelled',JSON.stringify({fee,nearPickup:near,percent:finance.CANCEL_PERCENT})]);
 });
 return {...await getById(rideId,riderId),cancellationFee:fee,chargedOnNextRide:fee>0};
}
async function rate(riderId,rideId,stars,feedback,tip){
 const r=await db.query('SELECT * FROM rides WHERE id=? AND rider_id=? AND status="completed"',[rideId,riderId]); if(!r.length)throw ApiError.notFound('Completed ride not found');
 if(stars<1||stars>5)throw ApiError.badRequest('Rating must be 1-5.');
 await db.query('INSERT INTO ratings(ride_id,from_user_id,to_user_id,stars,feedback) VALUES(?,?,?,?,?)',[rideId,riderId,r[0].driver_id,stars,feedback||null]);
 if(tip && Number(tip)>0){
   const amount=Number(tip); if(r[0].payment_method==='wallet') await chargeWallet(riderId,amount,'tip',rideId,'Tip to driver');
   await db.query('UPDATE rides SET tip=tip+?,total_paid=total_paid+? WHERE id=?',[amount,amount,rideId]);
 }
 const avg=(await db.query('SELECT AVG(stars) avg FROM ratings WHERE to_user_id=?',[r[0].driver_id]))[0].avg;
 await db.query('UPDATE driver_profiles SET rating=? WHERE user_id=?',[avg,r[0].driver_id]); return {rating:stars,tip:Number(tip||0)};
}
async function chargeWallet(userId,amount,type,refId,description){
 return db.transaction(async conn=>{
  const [w]=await conn.query('SELECT balance FROM wallets WHERE user_id=? FOR UPDATE',[userId]); if(!w.length||Number(w[0].balance)<amount)throw ApiError.badRequest('Insufficient wallet balance.');
  const before=Number(w[0].balance),after=before-amount; await conn.query('UPDATE wallets SET balance=? WHERE user_id=?',[after,userId]); await conn.query('INSERT INTO wallet_transactions(user_id,type,amount,balance_before,balance_after,reference_type,reference_id,payment_method,description) VALUES(?,?,?,?,?,?,?,?,?)',[userId,type,-amount,before,after,type,refId,'wallet',description]); return after;
 });
}
async function pushUser(userId,title,body,data){const t=await db.query('SELECT token FROM device_tokens WHERE user_id=?',[userId]); await sendPush(t.map(x=>x.token),{title,body},data);}
module.exports={quote,create,getById,listForUser,accept,setStatus,cancelRider,rate,haversine,chargeWallet};
