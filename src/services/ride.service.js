const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const config = require('../config/env');
const { sendPush } = require('../config/firebase');
const { notifyUser } = require('./notification.service');
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
 * Prefers Google Routes API (road distance + duration), then Distance Matrix, when GOOGLE_MAPS_API_KEY is set.
 * Falls back to Haversine + speed estimate so the system always works.
 */
async function getRouteMetrics(pickupLat, pickupLng, destLat, destLng) {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_DISTANCE_MATRIX_KEY || '';
  if (key) {
    // 1) Routes API (the current Google routing API).
    try {
      const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration'
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: pickupLat, longitude: pickupLng } } },
          destination: { location: { latLng: { latitude: destLat, longitude: destLng } } },
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_AWARE'
        })
      });
      const data = await res.json();
      const r = data && data.routes && data.routes[0];
      if (r && r.distanceMeters != null && r.duration) {
        const seconds = parseInt(String(r.duration).replace('s', ''), 10);
        if (Number.isFinite(seconds)) {
          return {
            distanceKm: Number((r.distanceMeters / 1000).toFixed(2)),
            durationMin: Math.max(1, Math.ceil(seconds / 60)),
            source: 'google-routes'
          };
        }
      }
    } catch (e) {
      console.warn('[ride] Google Routes API failed, trying Distance Matrix:', e.message);
    }
    // 2) Legacy Distance Matrix (only works if that API is enabled on the key).
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
  if (isDriver && !isRider) {
    // The trip PIN is a secret the rider reads out to the driver. The driver must never receive it.
    const { trip_pin, tripPin, ...rest } = ride;
    return rest;
  }
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
 const rows=await db.query(`SELECT r.*,ru.full_name rider_name,ru.phone rider_phone,ru.photo_url rider_photo,du.full_name driver_name,du.phone driver_phone,du.photo_url driver_photo,v.type vehicle_type,v.plate_number vehicle_number,v.make vehicle_make,v.model vehicle_model,v.color vehicle_color,d.rating driver_rating,d.total_rides driver_total_rides,d.current_lat driver_lat,d.current_lng driver_lng FROM rides r JOIN users ru ON ru.id=r.rider_id LEFT JOIN users du ON du.id=r.driver_id LEFT JOIN driver_profiles d ON d.user_id=r.driver_id LEFT JOIN vehicles v ON v.id=r.vehicle_id WHERE r.id=?`,[id]);
 if(!rows.length || (userId && Number(rows[0].rider_id)!==Number(userId) && Number(rows[0].driver_id)!==Number(userId))) throw ApiError.notFound('Ride not found');
 const x=rows[0];
 const ride={...x,estimated_fare:Number(x.estimated_fare),final_fare:x.final_fare==null?null:Number(x.final_fare),discount:Number(x.discount),tip:Number(x.tip),total_paid:Number(x.total_paid),cancellation_fee:Number(x.cancellation_fee||0)};
 await attachLiveState(ride);
 return sanitizeRiderRide(ride, userId);
}

/**
 * Adds everything the apps need to render a live trip without extra calls:
 *  - nested `driver` object (name, phone, photo, vehicle, rating, live lat/lng)
 *  - `amount_due` and `payment_status` (not_due | pending | awaiting_cash | processing | paid)
 *  - `reached_destination`
 *  - driver earnings once the ride is completed
 * State is derived from ride_events / payment_transactions so no schema change is needed.
 */
async function attachLiveState(ride){
 const events=await db.query(`SELECT event_type,payload,created_at FROM ride_events WHERE ride_id=? AND event_type IN ('reached_destination','rider_cash_selected','payment_confirmed') ORDER BY id ASC`,[ride.id]);
 const has=(t)=>events.find(e=>e.event_type===t);
 const reached=!!has('reached_destination');
 const confirmed=has('payment_confirmed');
 let paymentStatus='not_due';
 if(ride.status==='completed' || confirmed) paymentStatus='paid';
 else if(ride.status==='started' && reached){
   paymentStatus='pending';
   if(has('rider_cash_selected')) paymentStatus='awaiting_cash';
   const tx=await db.query(`SELECT status FROM payment_transactions WHERE JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.rideId'))=? AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.channel'))='ride_payment' ORDER BY id DESC LIMIT 1`,[String(ride.id)]).catch(()=>[]);
   if(tx.length && tx[0].status==='pending') paymentStatus='processing';
 }
 ride.reached_destination=reached;
 ride.payment_status=paymentStatus;
 ride.amount_due=Math.max(0,Number(ride.estimated_fare)-Number(ride.discount||0)+Number(ride.cancellation_fee||0)+Number(ride.tip||0));
 if(ride.driver_id){
   ride.driver={
     id:ride.driver_id,
     fullName:ride.driver_name,
     name:ride.driver_name,
     phone:ride.driver_phone,
     photoUrl:ride.driver_photo,
     plateNumber:ride.vehicle_number,
     vehicleType:ride.vehicle_type,
     vehicleMake:ride.vehicle_make||null,
     vehicleModel:ride.vehicle_model||null,
     vehicleColor:ride.vehicle_color||null,
     rating:ride.driver_rating==null?null:Number(ride.driver_rating),
     totalRides:Number(ride.driver_total_rides||0),
     lat:ride.driver_lat==null?null:Number(ride.driver_lat),
     lng:ride.driver_lng==null?null:Number(ride.driver_lng)
   };
 }
 if(ride.status==='completed' && ride.driver_id){
   const led=await db.query('SELECT gross_amount,commission_amount,driver_amount FROM driver_earning_ledger WHERE ride_id=? AND driver_id=? LIMIT 1',[ride.id,ride.driver_id]).catch(()=>[]);
   if(led.length){
     ride.driver_earnings=Number(led[0].driver_amount);
     ride.platform_commission=Number(led[0].commission_amount);
     ride.gross_amount=Number(led[0].gross_amount);
   }
 }
 return ride;
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
  let riderId = null;
  try {
    const [riderRows] = await conn.query('SELECT rider_id FROM rides WHERE id=?',[rideId]);
    riderId = riderRows && riderRows[0] ? riderRows[0].rider_id : null;
  } catch (_) {}
  // Commit first, then notify — never fail the accept response because of push/getById
  return { id: Number(rideId), status: 'accepted', riderId };
 }).then(async (accepted) => {
  try {
    if (accepted && accepted.riderId) {
      await pushUser(accepted.riderId,'Driver on the way','Your ZenjiGO driver accepted the ride and is heading to you.',{type:'ride_accepted',rideId:String(accepted.id),status:'accepted'});
    }
  } catch (e) { console.warn('[accept push]', e.message); }
  try {
    return await getById(accepted.id, driverId);
  } catch (_) {
    return accepted;
  }
 });
}
const STATUS_TITLES = {
  arriving: 'Driver is on the way',
  arrived: 'Driver has arrived',
  started: 'Trip started',
  completed: 'Ride completed',
  cancelled: 'Ride cancelled'
};
const STATUS_BODIES = {
  arriving: 'Your driver is coming to the pickup point.',
  arrived: 'Your driver is at the pickup location. Share your PIN to start the trip.',
  started: 'Enjoy your ZenjiGO trip.',
  completed: 'Thanks for riding with ZenjiGO. Rate your trip!',
  cancelled: 'Your driver cancelled this ride.'
};

/**
 * Driver-driven status changes.
 *  - started   : requires the rider's 4-digit trip PIN (`otp`).
 *  - completed : only allowed once payment is confirmed (wallet/mobile-money by the system, cash by the driver).
 *                Normal completion happens automatically through confirmPaymentAndComplete().
 */
async function setStatus(driverId,rideId,status,opts={}){
 if(status!=='completed' && status!=='cancelled') await finance.assertUsable(driverId,'continue accepting rides');
 const allowed={arriving:['accepted'],arrived:['arriving','accepted'],started:['arrived'],completed:['started'],cancelled:['accepted','arriving','arrived']};
 if(status==='completed'){
   const cur=await db.query('SELECT id FROM ride_events WHERE ride_id=? AND event_type=? LIMIT 1',[rideId,'payment_confirmed']);
   if(!cur.length) throw ApiError.conflict('Payment has not been confirmed yet. The ride ends automatically once the rider has paid (or you confirm cash).');
   return confirmPaymentAndComplete(rideId,{source:'driver_status',driverId});
 }
 const result=await db.transaction(async conn=>{
  const [rows]=await conn.query('SELECT * FROM rides WHERE id=? AND driver_id=? FOR UPDATE',[rideId,driverId]);
  if(!rows.length) throw ApiError.notFound('Ride not found');
  const r=rows[0];
  if(r.status===status) return null; // idempotent: already in this state
  if(!allowed[status]?.includes(r.status)) throw ApiError.conflict(`Cannot change ride from ${r.status} to ${status}.`);
  if(status==='started'){
    const pin=String(opts.otp==null?'':opts.otp).trim();
    if(!pin) throw ApiError.badRequest('Enter the 4-digit PIN shown on the rider\'s screen to start the ride.');
    if(pin!==String(r.trip_pin)) throw ApiError.badRequest('Incorrect PIN. Ask the rider to read the PIN from their app.');
  }
  let sql='UPDATE rides SET status=?'; const vals=[status];
  if(status==='arriving') sql+=',accepted_at=COALESCE(accepted_at,UTC_TIMESTAMP())';
  if(status==='arrived') sql+=',arrived_at=UTC_TIMESTAMP()';
  if(status==='started') sql+=',started_at=UTC_TIMESTAMP()';
  if(status==='cancelled'){sql+=',cancelled_at=UTC_TIMESTAMP(),cancel_reason=?'; vals.push('Cancelled by driver');}
  sql+=' WHERE id=?'; vals.push(rideId);
  await conn.query(sql,vals);
  await conn.query('INSERT INTO ride_events(ride_id,actor_id,event_type) VALUES(?,?,?)',[rideId,driverId,status]);
  return r;
 });
 if(result){
   await pushUser(result.rider_id, STATUS_TITLES[status]||`Ride ${status}`, STATUS_BODIES[status]||`Your ride is now ${status}.`, { type:'ride_status', rideId:String(rideId), status:String(status) });
 }
 return getById(rideId,driverId);
}

/** Driver reached the drop-off point: tells both apps to move to the payment step. */
async function reachedDestination(driverId,rideId){
 const r=await db.query('SELECT * FROM rides WHERE id=? AND driver_id=?',[rideId,driverId]);
 if(!r.length) throw ApiError.notFound('Ride not found');
 const x=r[0];
 if(x.status!=='started') throw ApiError.conflict('The ride has not started yet.');
 const done=await db.query('SELECT id FROM ride_events WHERE ride_id=? AND event_type=? LIMIT 1',[rideId,'reached_destination']);
 if(!done.length){
   await db.query('INSERT INTO ride_events(ride_id,actor_id,event_type) VALUES(?,?,?)',[rideId,driverId,'reached_destination']);
   const due=Math.max(0,Number(x.estimated_fare)-Number(x.discount||0)+Number(x.cancellation_fee||0)+Number(x.tip||0));
   await pushUser(x.rider_id,'You have reached your destination',`Please pay TZS ${Math.round(due).toLocaleString()} to finish your trip.`,{type:'ride_payment_due',rideId:String(rideId),status:'started'});
 }
 return getById(rideId,driverId);
}

/**
 * Single place where a ride becomes `completed`. Called after payment has been confirmed:
 *  - wallet / mobile-money: by the system (rider pay endpoint or provider webhook)
 *  - cash: by the driver confirming the cash was received
 */
async function confirmPaymentAndComplete(rideId,meta={}){
 const done=await db.transaction(async conn=>{
  const [rows]=await conn.query('SELECT * FROM rides WHERE id=? FOR UPDATE',[rideId]);
  if(!rows.length) throw ApiError.notFound('Ride not found');
  const r=rows[0];
  if(r.status==='completed') return {r,already:true};
  if(r.status!=='started') throw ApiError.conflict(`Cannot complete a ride that is ${r.status}.`);
  if(!r.driver_id) throw ApiError.conflict('Ride has no driver.');
  const [ev]=await conn.query('SELECT id FROM ride_events WHERE ride_id=? AND event_type=? LIMIT 1',[rideId,'payment_confirmed']);
  if(!ev.length) {
    await conn.query('INSERT INTO ride_events(ride_id,actor_id,event_type,payload) VALUES(?,?,?,?)',[rideId,meta.driverId||null,'payment_confirmed',JSON.stringify({method:meta.method||r.payment_method,source:meta.source||'system'})]);
  }
  await conn.query(`UPDATE rides SET status='completed',completed_at=UTC_TIMESTAMP(),final_fare=GREATEST(0,estimated_fare-discount),total_paid=GREATEST(0,estimated_fare-discount+cancellation_fee+tip) WHERE id=?`,[rideId]);
  await conn.query('INSERT INTO ride_events(ride_id,actor_id,event_type) VALUES(?,?,?)',[rideId,r.driver_id,'completed']);
  const total=Math.max(0,Number(r.estimated_fare)-Number(r.discount)+Number(r.cancellation_fee||0)+Number(r.tip||0));
  const earning=await finance.recordRideEarning(conn,r.driver_id,total,rideId);
  if(Number(r.cancellation_fee||0)>0){
    await conn.query('UPDATE rider_cancellation_debts SET amount=GREATEST(0,amount-?),updated_at=UTC_TIMESTAMP() WHERE rider_id=?',[Number(r.cancellation_fee),r.rider_id]);
    await conn.query('UPDATE rider_profiles SET cancellation_debt=GREATEST(0,cancellation_debt-?) WHERE user_id=?',[Number(r.cancellation_fee),r.rider_id]);
  }
  await conn.query('UPDATE rider_profiles SET total_rides=total_rides+1 WHERE user_id=?',[r.rider_id]);
  return {r,already:false,earning};
 });
 if(!done.already){
   const {r,earning}=done;
   await pushUser(r.rider_id,'Payment received','Thank you! Your ride is complete. Rate your trip.',{type:'ride_status',rideId:String(rideId),status:'completed'});
   const share=earning && earning.driverShare!=null?Math.round(earning.driverShare):null;
   await pushUser(r.driver_id,'Trip completed',share!=null?`Your share: TZS ${share.toLocaleString()}.`:'Fare recorded. Check Earnings for details.',{type:'ride_completed',rideId:String(rideId)});
   try{
     const fs=await finance.getStatus(r.driver_id);
     if(fs.blocked && fs.autopayEnabled) await finance.tryAutopay(r.driver_id);
   }catch(e){ console.warn('[ride complete autopay]',e.message); }
 }
 return getById(rideId,done.r.driver_id);
}

/**
 * Rider pays at the destination.
 *  - wallet : debited immediately, ride completes automatically.
 *  - cash   : rider announces cash; ride completes when the driver confirms the cash was received.
 *  - momo / card / bank : a mobile-money charge is started; the ride completes when the provider confirms it.
 */
async function payRide(riderId,rideId,input={}){
 const rows=await db.query('SELECT * FROM rides WHERE id=? AND rider_id=?',[rideId,riderId]);
 if(!rows.length) throw ApiError.notFound('Ride not found');
 const r=rows[0];
 if(r.status==='completed') return getById(rideId,riderId);
 if(r.status!=='started') throw ApiError.conflict('This ride is not ready for payment.');
 const reached=await db.query('SELECT id FROM ride_events WHERE ride_id=? AND event_type=? LIMIT 1',[rideId,'reached_destination']);
 if(!reached.length) throw ApiError.conflict('Payment opens once the driver confirms you have reached the destination.');
 const paid=await db.query('SELECT id FROM ride_events WHERE ride_id=? AND event_type=? LIMIT 1',[rideId,'payment_confirmed']);
 if(paid.length){ await confirmPaymentAndComplete(rideId,{source:'system'}); return getById(rideId,riderId); }

 const method=['cash','wallet','momo','bank','card'].includes(input.method)?input.method:r.payment_method;
 if(method!==r.payment_method) await db.query('UPDATE rides SET payment_method=? WHERE id=?',[method,rideId]);
 const total=Math.max(0,Number(r.estimated_fare)-Number(r.discount)+Number(r.cancellation_fee||0)+Number(r.tip||0));

 if(method==='cash'){
   const sel=await db.query('SELECT id FROM ride_events WHERE ride_id=? AND event_type=? LIMIT 1',[rideId,'rider_cash_selected']);
   if(!sel.length){
     await db.query('INSERT INTO ride_events(ride_id,actor_id,event_type) VALUES(?,?,?)',[rideId,riderId,'rider_cash_selected']);
     if(r.driver_id) await pushUser(r.driver_id,'Collect cash',`Collect TZS ${Math.round(total).toLocaleString()} cash from the rider, then confirm to end the ride.`,{type:'ride_collect_cash',rideId:String(rideId)});
   }
   return {...(await getById(rideId,riderId)),payment_status:'awaiting_cash'};
 }

 if(method==='wallet'){
   const wRows=await db.query('SELECT balance FROM wallets WHERE user_id=?',[riderId]);
   const w=wRows[0];
   if(!w || Number(w.balance||0)<total) throw ApiError.badRequest('Your wallet balance is not enough. Top up or choose another way to pay.');
   await db.transaction(async conn=>{
     const [wl]=await conn.query('SELECT balance FROM wallets WHERE user_id=? FOR UPDATE',[riderId]);
     if(!wl.length || Number(wl[0].balance)<total) throw ApiError.badRequest('Your wallet balance is not enough. Top up or choose another way to pay.');
     const [ev]=await conn.query('SELECT id FROM ride_events WHERE ride_id=? AND event_type=? LIMIT 1 FOR UPDATE',[rideId,'payment_confirmed']);
     if(ev.length) return;
     const before=Number(wl[0].balance), after=before-total;
     await conn.query('UPDATE wallets SET balance=? WHERE user_id=?',[after,riderId]);
     await conn.query('INSERT INTO wallet_transactions(user_id,type,amount,balance_before,balance_after,reference_type,reference_id,payment_method,description) VALUES(?,?,?,?,?,?,?,?,?)',[riderId,'ride',-total,before,after,'ride',rideId,'wallet','Ride payment']);
     await conn.query('INSERT INTO ride_events(ride_id,actor_id,event_type,payload) VALUES(?,?,?,?)',[rideId,riderId,'payment_confirmed',JSON.stringify({method:'wallet',source:'system',amount:total})]);
   });
   await confirmPaymentAndComplete(rideId,{source:'system',method:'wallet'});
   return getById(rideId,riderId);
 }

 // Mobile money (momo / card / bank) → provider charge, confirmed by webhook.
 const existing=await db.query(`SELECT id,status FROM payment_transactions WHERE user_id=? AND status='pending' AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.rideId'))=? AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.channel'))='ride_payment' ORDER BY id DESC LIMIT 1`,[riderId,String(rideId)]);
 if(existing.length) return {...(await getById(rideId,riderId)),payment_status:'processing'};
 let phone=input.phone||null;
 if(!phone){ const u=await db.query('SELECT phone FROM users WHERE id=?',[riderId]); phone=u[0]?.phone||null; }
 if(!phone) throw ApiError.badRequest('A mobile-money phone number is required.');
 const paymentService=require('./payment.service');
 await paymentService.initiateRidePayment({userId:riderId,rideId,amount:total,phone});
 return {...(await getById(rideId,riderId)),payment_status:'processing'};
}

/** Driver confirms the rider handed over the cash. Completes the ride. */
async function collectCash(driverId,rideId){
 const rows=await db.query('SELECT * FROM rides WHERE id=? AND driver_id=?',[rideId,driverId]);
 if(!rows.length) throw ApiError.notFound('Ride not found');
 const r=rows[0];
 if(r.status==='completed') return getById(rideId,driverId);
 if(r.status!=='started') throw ApiError.conflict('The ride has not started yet.');
 const reached=await db.query('SELECT id FROM ride_events WHERE ride_id=? AND event_type=? LIMIT 1',[rideId,'reached_destination']);
 if(!reached.length) throw ApiError.conflict('Confirm that you have reached the destination first.');
 if(r.payment_method!=='cash'){
   const sel=await db.query('SELECT id FROM ride_events WHERE ride_id=? AND event_type=? LIMIT 1',[rideId,'rider_cash_selected']);
   if(!sel.length) throw ApiError.conflict('The rider chose to pay in-app. The ride ends automatically once the payment is verified.');
 }
 return confirmPaymentAndComplete(rideId,{source:'driver_cash',method:'cash',driverId});
}

/** Called by the payment webhook when a ride-payment charge succeeds. */
async function confirmRidePaymentFromProvider(rideId,riderId,info={}){
 const rows=await db.query('SELECT * FROM rides WHERE id=?',[rideId]);
 if(!rows.length) return null;
 const r=rows[0];
 if(r.status==='completed') return r;
 if(r.status!=='started') return r;
 const paid=await db.query('SELECT id FROM ride_events WHERE ride_id=? AND event_type=? LIMIT 1',[rideId,'payment_confirmed']);
 if(!paid.length){
   await db.query('INSERT INTO ride_events(ride_id,actor_id,event_type,payload) VALUES(?,?,?,?)',[rideId,riderId||null,'payment_confirmed',JSON.stringify({method:r.payment_method,source:'provider_webhook',reference:info.reference||null,amount:info.amount||null})]);
 }
 return confirmPaymentAndComplete(rideId,{source:'provider_webhook'});
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
async function pushUser(userId, title, body, data = {}) {
  const type = (data && data.type) || 'system';
  await notifyUser(userId, title, body, type, data);
}

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
  reachedDestination,
  payRide,
  collectCash,
  confirmPaymentAndComplete,
  confirmRidePaymentFromProvider,
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
