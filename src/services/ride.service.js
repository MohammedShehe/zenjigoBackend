const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const config = require('../config/env');
const { sendPush } = require('../config/firebase');
const finance = require('./driver_finance.service');

function haversine(a, b, c, d) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (c - a) * rad;
  const dLon = (d - b) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Default fare config (used when app_settings has no ride_fares yet). */
function defaultFareConfig() {
  return {
    baseFare: config.ride.baseFare,
    perKm: config.ride.perKm,
    perMinute: config.ride.perMinute,
    bookingFee: config.ride.bookingFee,
    multipliers: { boda: 1, bajaji: 1.15, taxi: 1.5 },
    currency: config.ride.currency || 'TZS'
  };
}

/** Load live fare settings from MySQL app_settings (admin-editable). */
async function getFareConfig() {
  try {
    const rows = await db.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'ride_fares' LIMIT 1`
    );
    if (rows.length) {
      const parsed = typeof rows[0].setting_value === 'string'
        ? JSON.parse(rows[0].setting_value)
        : rows[0].setting_value;
      const def = defaultFareConfig();
      return {
        baseFare: Number(parsed.baseFare ?? def.baseFare),
        perKm: Number(parsed.perKm ?? def.perKm),
        perMinute: Number(parsed.perMinute ?? def.perMinute),
        bookingFee: Number(parsed.bookingFee ?? def.bookingFee),
        multipliers: {
          boda: Number(parsed.multipliers?.boda ?? def.multipliers.boda),
          bajaji: Number(parsed.multipliers?.bajaji ?? def.multipliers.bajaji),
          taxi: Number(parsed.multipliers?.taxi ?? def.multipliers.taxi)
        },
        currency: parsed.currency || def.currency
      };
    }
  } catch (_) { /* fall through */ }
  return defaultFareConfig();
}

function computeFare(cfg, { rideType, distanceKm, durationMin }) {
  const multiplier = cfg.multipliers[rideType] ?? 1;
  return Math.round(
    (cfg.baseFare + distanceKm * cfg.perKm + durationMin * cfg.perMinute + cfg.bookingFee) * multiplier
  );
}

function code(prefix = 'ZG') {
  return `${prefix}${Date.now().toString(36).toUpperCase().slice(-7)}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
}

/**
 * Prefer Google Distance Matrix (road distance + duration) when GOOGLE_MAPS_API_KEY is set.
 * Falls back to Haversine + speed estimate so the system always works.
 */
async function getRouteMetrics(pickupLat, pickupLng, destLat, destLng) {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_DISTANCE_MATRIX_KEY || '';
  if (key) {
    try {
      const origin = `${pickupLat},${pickupLng}`;
      const dest = `${destLat},${destLng}`;
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(dest)}&mode=driving&units=metric&key=${key}`;
      const res = await fetch(url);
      const data = await res.json();
      const el = data?.rows?.[0]?.elements?.[0];
      if (el && el.status === 'OK' && el.distance && el.duration) {
        return {
          distanceKm: Number((el.distance.value / 1000).toFixed(2)),
          durationMin: Math.max(1, Math.ceil(el.duration.value / 60)),
          source: 'google'
        };
      }
    } catch (e) {
      console.warn('[ride] Google Distance Matrix failed, using Haversine:', e.message);
    }
  }
  const distanceKm = haversine(pickupLat, pickupLng, destLat, destLng);
  // ~27 km/h average urban speed estimate for Zanzibar traffic
  const durationMin = Math.max(5, Math.round(distanceKm / 0.45));
  return {
    distanceKm: Number(distanceKm.toFixed(2)),
    durationMin,
    source: 'haversine'
  };
}

async function quote(input) {
  const cfg = await getFareConfig();
  const metrics = await getRouteMetrics(
    Number(input.pickupLat),
    Number(input.pickupLng),
    Number(input.destinationLat),
    Number(input.destinationLng)
  );
  const estimatedFare = computeFare(cfg, {
    rideType: input.rideType,
    distanceKm: metrics.distanceKm,
    durationMin: metrics.durationMin
  });
  return {
    distanceKm: metrics.distanceKm,
    durationMin: metrics.durationMin,
    estimatedFare,
    currency: cfg.currency,
    distanceSource: metrics.source,
    fareBreakdown: {
      baseFare: cfg.baseFare,
      perKm: cfg.perKm,
      perMinute: cfg.perMinute,
      bookingFee: cfg.bookingFee,
      multiplier: cfg.multipliers[input.rideType] ?? 1
    }
  };
}
async function create(riderId,input){
 if(!['boda','bajaji','taxi'].includes(input.rideType)) throw ApiError.badRequest('Invalid ride type');
 const q=await quote(input);
 const tripPin=Math.floor(1000+Math.random()*9000).toString();
 let discount=0;
 // Outstanding near-pickup cancel debt — folded into this ride total silently.
 let priorDebt=0;
 const debtRow=await db.query('SELECT cancellation_debt FROM rider_profiles WHERE user_id=?',[riderId]);
 if(debtRow.length) priorDebt=Math.max(0,Number(debtRow[0].cancellation_debt||0));
 if(input.promoCode){
   const p=await db.query(`SELECT * FROM promos WHERE code=? AND is_active=1 AND valid_from<=UTC_TIMESTAMP() AND valid_until>=UTC_TIMESTAMP() LIMIT 1`,[input.promoCode.toUpperCase()]);
   if(!p.length) throw ApiError.badRequest('Promo code is invalid or expired.');
   const used=await db.query('SELECT COUNT(*) n FROM promo_redemptions WHERE promo_id=? AND user_id=?',[p[0].id,riderId]);
   if(used[0].n>=p[0].per_user_limit) throw ApiError.badRequest('Promo usage limit reached for this rider.');
   discount=p[0].discount_type==='percent'?q.estimatedFare*Number(p[0].discount_value)/100:Number(p[0].discount_value);
   if(p[0].max_discount) discount=Math.min(discount,Number(p[0].max_discount));
   discount=Math.min(discount,q.estimatedFare);
 }
 // Store pure trip fare + prior debt separately for accounting.
 // Rider-facing APIs present a single total (fare - discount + debt) with no cancel label.
 const r=await db.query(`INSERT INTO rides(ride_code,rider_id,ride_type,pickup_address,pickup_lat,pickup_lng,destination_address,destination_lat,destination_lng,estimated_distance_km,estimated_duration_min,estimated_fare,discount,cancellation_fee,payment_method,promo_code,trip_pin) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
 [code(),riderId,input.rideType,input.pickupAddress,input.pickupLat,input.pickupLng,input.destinationAddress,input.destinationLat,input.destinationLng,q.distanceKm,q.durationMin,q.estimatedFare,discount,priorDebt,input.paymentMethod||'cash',input.promoCode?.toUpperCase()||null,tripPin]);
 await db.query('INSERT INTO ride_events(ride_id,actor_id,event_type,payload) VALUES(?,?,?,?)',[r.insertId,riderId,'requested',JSON.stringify({quote:q,priorDebtApplied:priorDebt,silent:true})]);
 if(priorDebt>0){
   await db.query('UPDATE rider_profiles SET cancellation_debt=0 WHERE user_id=?',[riderId]);
   await db.query('UPDATE rider_cancellation_debts SET amount=0, updated_at=UTC_TIMESTAMP() WHERE rider_id=?',[riderId]);
 }
 await notifyAvailableDrivers(r.insertId,input.rideType,input.pickupLat,input.pickupLng);
 return sanitizeRiderRide(await getById(r.insertId,riderId), riderId);
}

/** Hide cancel-debt breakdown from riders; present one total fare. */
function sanitizeRiderRide(ride, viewerUserId) {
  if (!ride) return ride;
  const isRider = viewerUserId != null && Number(ride.rider_id) === Number(viewerUserId);
  const isDriver = viewerUserId != null && ride.driver_id != null && Number(ride.driver_id) === Number(viewerUserId);
  const est = Number(ride.estimated_fare || 0);
  const disc = Number(ride.discount || 0);
  const debt = Number(ride.cancellation_fee || 0);
  const tip = Number(ride.tip || 0);
  const pureTotal = Math.max(0, est - disc);
  const displayFare = pureTotal + debt;
  if (isRider && !isDriver) {
    const out = { ...ride };
    // Single total the rider sees (prior cancel debt folded in, no label).
    out.estimated_fare = displayFare;
    out.final_fare = ride.final_fare != null ? Number(ride.final_fare) + (ride.status === 'completed' ? 0 : 0) : null;
    if (ride.status === 'completed' && ride.total_paid != null) {
      out.total_paid = Number(ride.total_paid);
    } else if (ride.status === 'completed') {
      out.total_paid = displayFare + tip;
    }
    delete out.cancellation_fee;
    delete out.cancellation_fee_applied;
    return out;
  }
  return ride;
}

async function notifyAvailableDrivers(rideId,rideType,lat,lng){
 const drivers=await db.query(`SELECT d.user_id,u.full_name FROM driver_profiles d JOIN users u ON u.id=d.user_id LEFT JOIN driver_locations l ON l.driver_id=d.user_id AND l.id=(SELECT MAX(id) FROM driver_locations WHERE driver_id=d.user_id) JOIN vehicles v ON v.driver_id=d.user_id AND v.status='active' AND v.type=? WHERE d.online=1 AND d.application_status='active' AND u.status='active' GROUP BY d.user_id LIMIT 30`,[rideType]);
 const tokens=drivers.length?await db.query(`SELECT token FROM device_tokens WHERE user_id IN (${drivers.map(()=>'?').join(',')})`,drivers.map(x=>x.user_id)):[]; await sendPush(tokens.map(x=>x.token),{title:'New ride request',body:'A rider nearby is requesting a ride.'},{type:'ride_request',rideId});
}
async function getById(id,userId=null){
 const rows=await db.query(`SELECT r.*,ru.full_name rider_name,ru.phone rider_phone,du.full_name driver_name,du.phone driver_phone,du.photo_url driver_photo,v.type vehicle_type,v.plate_number vehicle_number,d.rating driver_rating,d.total_rides driver_total_rides FROM rides r JOIN users ru ON ru.id=r.rider_id LEFT JOIN users du ON du.id=r.driver_id LEFT JOIN driver_profiles d ON d.user_id=r.driver_id LEFT JOIN vehicles v ON v.id=r.vehicle_id WHERE r.id=?`,[id]);
 if(!rows.length || (userId && rows[0].rider_id!==userId && rows[0].driver_id!==userId)) throw ApiError.notFound('Ride not found');
 const x=rows[0];
 const ride={...x,estimated_fare:Number(x.estimated_fare),final_fare:x.final_fare==null?null:Number(x.final_fare),discount:Number(x.discount),tip:Number(x.tip),total_paid:Number(x.total_paid),cancellation_fee:Number(x.cancellation_fee||0)};
 return sanitizeRiderRide(ride, userId);
}
async function listForUser(userId,role,limit=30){
 const col=role==='driver'?'r.driver_id':'r.rider_id';
 const rows=await db.query(`SELECT r.*,du.full_name driver_name,du.photo_url driver_photo,v.type vehicle_type,v.plate_number vehicle_number FROM rides r LEFT JOIN users du ON du.id=r.driver_id LEFT JOIN vehicles v ON v.id=r.vehicle_id WHERE ${col}=? ORDER BY r.created_at DESC LIMIT ?`,[userId,Math.min(Number(limit)||30,100)]);
 return rows.map((x) => sanitizeRiderRide({
   ...x,
   estimated_fare: Number(x.estimated_fare),
   final_fare: x.final_fare == null ? null : Number(x.final_fare),
   discount: Number(x.discount || 0),
   tip: Number(x.tip || 0),
   total_paid: Number(x.total_paid || 0),
   cancellation_fee: Number(x.cancellation_fee || 0)
 }, userId));
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
/**
 * Live rider-cancellation policy from app_settings (admin-editable).
 * Single key: rider_cancellation { nearPickupKm, percent }
 * Falls back to env defaults if not set.
 */
async function getCancelConfig() {
  const defKm = Number(process.env.CANCEL_NEAR_PICKUP_KM || 1);
  const defPct = Number(process.env.CANCEL_NEAR_PICKUP_PERCENT || 20);
  try {
    const rows = await db.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'rider_cancellation' LIMIT 1`
    );
    if (rows.length) {
      const parsed = typeof rows[0].setting_value === 'string'
        ? JSON.parse(rows[0].setting_value)
        : rows[0].setting_value;
      const nearPickupKm = Number(parsed.nearPickupKm ?? parsed.near_pickup_km ?? defKm);
      const percent = Number(parsed.percent ?? defPct);
      if (Number.isFinite(nearPickupKm) && nearPickupKm >= 0 && Number.isFinite(percent) && percent >= 0) {
        return { nearPickupKm, percent };
      }
    }
  } catch (_) { /* fall through */ }
  return { nearPickupKm: defKm, percent: defPct };
}

/**
 * Rider cancels a ride.
 * - If driver is within nearPickupKm of pickup (or status is arrived): fee = percent% of estimated fare.
 * - Rider is charged as debt (collected on the next ride).
 * - Driver is credited that fee as an earning (compensation for going to pickup).
 * - Searching (no driver) or driver still far away: no fee.
 */
async function cancelRider(riderId, rideId, reason) {
  const r = await db.query(
    `SELECT r.*, d.current_lat, d.current_lng
     FROM rides r
     LEFT JOIN driver_profiles d ON d.user_id = r.driver_id
     WHERE r.id = ? AND r.rider_id = ?`,
    [rideId, riderId]
  );
  if (!r.length) throw ApiError.notFound('Ride not found');
  if (!['searching', 'accepted', 'arriving', 'arrived'].includes(r[0].status)) {
    throw ApiError.conflict('This ride cannot be cancelled now.');
  }
  const x = r[0];
  const cancelCfg = await getCancelConfig();
  let fee = 0;
  let near = false;
  let distanceKm = null;

  if (x.driver_id && x.current_lat != null && x.current_lng != null) {
    distanceKm = finance.haversine(
      Number(x.current_lat),
      Number(x.current_lng),
      Number(x.pickup_lat),
      Number(x.pickup_lng)
    );
    near = distanceKm <= cancelCfg.nearPickupKm || x.status === 'arrived';
    if (near) {
      fee = Math.round(Number(x.estimated_fare) * cancelCfg.percent / 100);
    }
  }

  await db.transaction(async (conn) => {
    await conn.query(
      `UPDATE rides SET status='cancelled', cancel_reason=?, cancellation_fee=?,
       cancellation_fee_applied=?, cancelled_at=UTC_TIMESTAMP() WHERE id=?`,
      [reason || 'Cancelled by rider', fee, fee > 0 ? 1 : 0, rideId]
    );

    if (fee > 0) {
      // Rider debt — collected on their next ride (already applied as cancellation_fee on create)
      await conn.query(
        `INSERT INTO rider_cancellation_debts(rider_id, amount, last_ride_id)
         VALUES(?,?,?)
         ON DUPLICATE KEY UPDATE amount=amount+VALUES(amount), last_ride_id=VALUES(last_ride_id)`,
        [riderId, fee, rideId]
      );
      await conn.query(
        'UPDATE rider_profiles SET cancellation_debt=cancellation_debt+? WHERE user_id=?',
        [fee, riderId]
      );

      // Driver compensation: platform fronts 100% of fee (0% commission).
      // Recovered from rider on next ride (cash / wallet / PayGrid collect).
      if (x.driver_id) {
        await finance.recordCancellationCredit(conn, x.driver_id, fee, rideId);
      }
    }

    await conn.query(
      'INSERT INTO ride_events(ride_id, actor_id, event_type, payload) VALUES(?,?,?,?)',
      [
        rideId,
        riderId,
        'cancelled',
        JSON.stringify({
          fee,
          nearPickup: near,
          distanceKm,
          percent: cancelCfg.percent,
          nearPickupKm: cancelCfg.nearPickupKm,
          driverCredited: fee > 0 && !!x.driver_id
        })
      ]
    );
  });

  // Notify driver if assigned
  if (x.driver_id) {
    await pushUser(
      x.driver_id,
      'Ride cancelled by rider',
      fee > 0
        ? `Rider cancelled near pickup. You earned TZS ${fee.toLocaleString()} cancellation compensation.`
        : 'The rider cancelled this request.',
      { type: 'ride_cancelled', rideId, cancellationFee: fee }
    );
  }

  // Rider-facing response: do not expose fee amounts (applied silently on next ride).
  const ride = await getById(rideId, riderId);
  return sanitizeRiderRide(ride, riderId);
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

/** Preview cancellation fee without applying it (same rules as cancelRider). */
async function cancelPreview(riderId, rideId) {
  const r = await db.query(
    `SELECT r.*, d.current_lat, d.current_lng
     FROM rides r
     LEFT JOIN driver_profiles d ON d.user_id = r.driver_id
     WHERE r.id = ? AND r.rider_id = ?`,
    [rideId, riderId]
  );
  if (!r.length) throw ApiError.notFound('Ride not found');
  const x = r[0];
  if (!['searching', 'accepted', 'arriving', 'arrived'].includes(x.status)) {
    throw ApiError.conflict('This ride cannot be cancelled now.');
  }
  const cancelCfg = await getCancelConfig();
  let fee = 0;
  let near = false;
  let distanceKm = null;
  if (x.driver_id && x.current_lat != null && x.current_lng != null) {
    distanceKm = finance.haversine(
      Number(x.current_lat),
      Number(x.current_lng),
      Number(x.pickup_lat),
      Number(x.pickup_lng)
    );
    near = distanceKm <= cancelCfg.nearPickupKm || x.status === 'arrived';
    if (near) fee = Math.round(Number(x.estimated_fare) * cancelCfg.percent / 100);
  }
  // Rider-facing: never expose fee amounts or debt rules. Fee is applied silently on next ride.
  return {
    canCancel: true,
    message: 'You can cancel this ride.'
  };
}

/**
 * Online drivers near a point (for map display).
 * Uses driver_profiles.current_lat/lng updated by the driver app.
 */
async function nearbyDrivers(lat, lng, radiusKm = 5) {
  const radius = Math.min(Math.max(Number(radiusKm) || 5, 0.5), 50);
  const plat = Number(lat);
  const plng = Number(lng);
  if (Number.isNaN(plat) || Number.isNaN(plng)) throw ApiError.badRequest('lat and lng are required');
  // Bounding box then precise haversine filter in JS for simplicity
  const deg = radius / 111; // ~km per degree latitude
  const rows = await db.query(
    `SELECT d.user_id AS id, u.full_name AS fullName, u.photo_url AS photoUrl,
            d.current_lat AS lat, d.current_lng AS lng, d.rating,
            v.type AS vehicleType, v.plate_number AS plateNumber
     FROM driver_profiles d
     JOIN users u ON u.id = d.user_id AND u.status = 'active'
     LEFT JOIN vehicles v ON v.driver_id = d.user_id AND v.status = 'active'
     WHERE d.online = 1
       AND d.application_status = 'active'
       AND d.current_lat IS NOT NULL
       AND d.current_lng IS NOT NULL
       AND d.current_lat BETWEEN ? AND ?
       AND d.current_lng BETWEEN ? AND ?
     LIMIT 80`,
    [plat - deg, plat + deg, plng - deg, plng + deg]
  );
  return rows
    .map((d) => {
      const km = haversine(plat, plng, Number(d.lat), Number(d.lng));
      return { ...d, distanceKm: Math.round(km * 100) / 100 };
    })
    .filter((d) => d.distanceKm <= radius)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 40);
}

module.exports = {
  quote,
  create,
  getById,
  listForUser,
  accept,
  setStatus,
  cancelRider,
  cancelPreview,
  nearbyDrivers,
  rate,
  haversine,
  chargeWallet,
  getFareConfig,
  defaultFareConfig,
  getCancelConfig
};
