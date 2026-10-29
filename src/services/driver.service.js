const { signAccess, issueRefreshToken } = require('../utils/jwt');
const { notifyUser } = require('./notification.service');
const db=require('../config/db'); const ApiError=require('../utils/ApiError'); const {normalizePhone}=require('../utils/phone'); const {upload}=require('./upload.service'); const {hashPassword}=require('../utils/hash'); const {publicUser}=require('./auth.service'); const config=require('../config/env'); const otp=require('./otp.service'); const {sendWelcomeEmail}=require('./welcome-email.service');
function code(id){return `ZG-DRV-${String(id).padStart(6,'0')}`;}
async function register(data,files){
 // Accept both historical multipart field names so older clients remain compatible.
 // Normalize to a clean map of document-type keys only (avoid double-uploading nationalIdFile as vehicle_photo).
 const incoming = files || {};
 const normalizedFiles = {
   license: incoming.license || [],
   nationalId: (incoming.nationalId && incoming.nationalId.length)
     ? incoming.nationalId
     : (incoming.nationalIdFile && incoming.nationalIdFile.length ? incoming.nationalIdFile : []),
   insurance: incoming.insurance || [],
   driverPhoto: incoming.driverPhoto || [],
   vehiclePhotos: incoming.vehiclePhotos || []
 };
 files = normalizedFiles;

 const phone=normalizePhone(data.phone);
 const emailTarget=String(data.email||'').trim().toLowerCase();
 if(!emailTarget||!emailTarget.includes('@')) throw ApiError.badRequest('A valid email is required.');
 // The Flutter app verifies email at step 1, while the web form submits the
 // code only at the end. Accept a recent persisted verification OR verify the
 // still-pending code supplied by the web form.
 await otp.verifyRegistrationForSubmit({
   target: emailTarget,
   code: data.emailOtpCode,
   purpose: 'driver_registration'
 });
 if(!String(data.fullName || '').trim() ||
    !String(data.phone || '').trim() ||
    !emailTarget ||
    !String(data.nationalId || '').trim() ||
    !String(data.plateNumber || '').trim() ||
    !String(data.vehicleType || '').trim()) {
   throw ApiError.badRequest('Full name, phone, email, national ID, vehicle type and plate number are required.');
 }
 if(!files?.license?.[0] || !files?.nationalId?.[0] || !files?.insurance?.[0] || !files?.driverPhoto?.[0]) {
   throw ApiError.badRequest('License, national ID, insurance and driver photo are required.');
 }
 const existing=await db.query("SELECT id FROM users WHERE role='driver' AND (phone=? OR email=?)",[phone,emailTarget]);
 if(existing.length) throw ApiError.conflict('A user already exists with this phone or email.');

 // CRITICAL FIX: Upload ALL documents to Cloudinary FIRST.
 // Only create the driver in the database after every file succeeds.
 // Previously the user was inserted first, so a Cloudinary failure left an orphan driver with no documents.
 const typeMap = {
   license: 'drivers_license',
   nationalId: 'national_id',
   insurance: 'insurance',
   driverPhoto: 'driver_photo',
   vehiclePhotos: 'vehicle_photo'
 };
 const uploaded = [];
 const folderBase = `${config.cloudinary.folder}/drivers`;
 for (const [key, val] of Object.entries(files)) {
   const list = Array.isArray(val) ? val : (val ? [val] : []);
   for (const f of list) {
     if (!f || !f.buffer) continue;
     const docType = typeMap[key] || 'other';
     // Use a temporary subfolder; we will rewrite public_id path conceptually via folder after we know id
     // Using a shared pending folder is fine; Cloudinary folder is just organization.
     const u = await upload(f, `${folderBase}/pending`);
     const expKey = `expires_${key}`;
     const expiresAt = data[expKey] || data[`expires${key.charAt(0).toUpperCase()+key.slice(1)}`] || null;
     uploaded.push({ type: docType, publicId: u.publicId, url: u.url, resourceType: u.resourceType, expiresAt });
   }
 }
 if (uploaded.length < 4) {
   throw ApiError.badRequest('License, national ID, insurance and driver photo must all upload successfully.');
 }

 // All uploads succeeded — now create the driver + document rows in one transaction.
 const result = await db.transaction(async conn => {
   const [r] = await conn.query(
     'INSERT INTO users(role,full_name,phone,email,status) VALUES("driver",?,?,?,"pending")',
     [data.fullName, phone, data.email.toLowerCase()]
   );
   const id = r.insertId;
   await conn.query(
     'INSERT INTO driver_profiles(user_id,driver_code,national_id,home_address,application_status) VALUES(?,?,?,?,"pending")',
     [id, code(id), data.nationalId, data.homeAddress || null]
   );
   await conn.query(
     'INSERT INTO vehicles(driver_id,type,plate_number,make,model,color,model_year) VALUES(?,?,?,?,?,?,?)',
     [id, data.vehicleType, data.plateNumber, data.vehicleMake || null, data.vehicleModel || null, data.vehicleColor || null, data.modelYear || null]
   );
   for (const u of uploaded) {
     await conn.query(
       'INSERT INTO driver_documents(driver_id,document_type,public_id,url,resource_type,status,expires_at) VALUES(?,?,?,?,?,"pending",?)',
       [id, u.type, u.publicId, u.url, u.resourceType, u.expiresAt || null]
     );
   }
   return id;
 });

 try { await sendWelcomeEmail({ email: emailTarget, name: data.fullName, role: 'driver' }); }
 catch (err) { console.error('[WELCOME EMAIL] Failed to send driver welcome email:', err.message); }

 // Issue session tokens immediately so the driver app can call authenticated
 // endpoints (profile, documents, photo) while the application is under review.
 const accessToken = signAccess({ sub: result, role: 'driver' });
 const refreshToken = await issueRefreshToken(result, 'driver');
 const userRows = await db.query(
   `SELECT u.id,u.full_name,u.phone,u.email,u.photo_url,u.status,u.role,d.application_status,d.driver_code,d.online,d.rating
    FROM users u LEFT JOIN driver_profiles d ON d.user_id=u.id WHERE u.id=? LIMIT 1`,
   [result]
 );
 const u = userRows[0] || { id: result, role: 'driver' };
 return {
   driverId: result,
   driverCode: code(result),
   documents: uploaded.map(u => ({ type: u.type, url: u.url })),
   status: 'pending',
   applicationStatus: 'pending',
   accessToken,
   refreshToken,
   user: {
     id: u.id,
     role: 'driver',
     fullName: u.full_name,
     full_name: u.full_name,
     phone: u.phone,
     email: u.email,
     photoUrl: u.photo_url,
     photo_url: u.photo_url,
     status: u.status,
     application_status: u.application_status || 'pending',
     applicationStatus: u.application_status || 'pending',
     driver_code: u.driver_code,
     online: !!u.online,
     rating: u.rating != null ? Number(u.rating) : null,
   },
 };
}
async function profile(id){
 const rows=await db.query(`SELECT u.id,u.full_name,u.phone,u.email,u.photo_url,u.status,d.*,v.id vehicle_id,v.type vehicle_type,v.plate_number,v.make,v.model,v.color,v.model_year FROM users u JOIN driver_profiles d ON d.user_id=u.id LEFT JOIN vehicles v ON v.driver_id=u.id AND v.status='active' WHERE u.id=?`,[id]); if(!rows.length)throw ApiError.notFound('Driver not found');
 const x=rows[0]; x.online=!!x.online; x.rating=Number(x.rating); x.total_earnings=Number(x.total_earnings); return x;
}
async function documents(id){return db.query('SELECT id,document_type,url,resource_type,expires_at,status,rejection_reason,created_at FROM driver_documents WHERE driver_id=? ORDER BY id DESC',[id]);}
async function setOnline(id,online){
 if(online){const d=await db.query(`SELECT application_status FROM driver_profiles WHERE user_id=?`,[id]);if(!d.length||d[0].application_status!=='active')throw ApiError.forbidden('Driver must be approved before going online.');}
 await db.query('UPDATE driver_profiles SET online=? WHERE user_id=?',[online?1:0,id]); return {online:!!online};
}
/** Haversine km */
function _km(a, b, c, d) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (c - a) * rad, dLon = (d - b) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Throttle live-tracking pushes per ride (ms)
const _livePushAt = new Map();
const LIVE_PUSH_INTERVAL_MS = Number(process.env.LIVE_TRACK_PUSH_INTERVAL_MS || 120000); // 2 min

const _histAt = new Map(); // driverId -> last breadcrumb timestamp (ms)
const HISTORY_INTERVAL_MS = Number(process.env.LOCATION_HISTORY_INTERVAL_MS || 10000);
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, t] of _histAt) if (t < cutoff) _histAt.delete(k);
  for (const [k, t] of _livePushAt) if (t < cutoff) _livePushAt.delete(k);
}, 5 * 60 * 1000).unref();

async function location(id, b) {
  const lat = Number(b && b.lat);
  const lng = Number(b && b.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw ApiError.badRequest('Invalid location.');
  }
  const r = await db.query(
    'UPDATE driver_profiles SET current_lat=?,current_lng=?,location_updated_at=UTC_TIMESTAMP() WHERE user_id=?',
    [lat, lng, id]
  );
  if (!r.affectedRows) throw ApiError.notFound('Driver not found');
  const rideId = b.rideId || null;
  // Breadcrumb history is throttled: the live position above is always fresh, but writing a row on every
  // GPS tick from every driver would flood the database.
  const nowMs = Date.now();
  if (nowMs - (_histAt.get(id) || 0) >= HISTORY_INTERVAL_MS) {
    _histAt.set(id, nowMs);
    await db.query(
      'INSERT INTO driver_locations(driver_id,ride_id,lat,lng,heading,speed) VALUES(?,?,?,?,?,?)',
      [id, rideId, lat, lng, b.heading ?? null, b.speed ?? null]
    );
  }

  // Live tracking push to rider while on an active trip (works with app in background via FCM)
  try {
    let ride = null;
    if (rideId) {
      const rows = await db.query(
        `SELECT id, rider_id, status, pickup_lat, pickup_lng, destination_lat, destination_lng
         FROM rides WHERE id=? AND driver_id=? AND status IN ('accepted','arriving','arrived','started') LIMIT 1`,
        [rideId, id]
      );
      ride = rows[0] || null;
    } else {
      const rows = await db.query(
        `SELECT id, rider_id, status, pickup_lat, pickup_lng, destination_lat, destination_lng
         FROM rides WHERE driver_id=? AND status IN ('accepted','arriving','arrived','started')
         ORDER BY id DESC LIMIT 1`,
        [id]
      );
      ride = rows[0] || null;
    }
    if (ride) {
      const key = String(ride.id);
      const now = Date.now();
      const last = _livePushAt.get(key) || 0;
      if (now - last >= LIVE_PUSH_INTERVAL_MS) {
        _livePushAt.set(key, now);
        const toPickup = ['accepted', 'arriving', 'arrived'].includes(ride.status);
        const targetLat = toPickup ? Number(ride.pickup_lat) : Number(ride.destination_lat);
        const targetLng = toPickup ? Number(ride.pickup_lng) : Number(ride.destination_lng);
        if (Number.isFinite(targetLat) && Number.isFinite(targetLng)) {
          const km = _km(lat, lng, targetLat, targetLng);
          const minutes = Math.max(1, Math.round((km / 0.45))); // ~27 km/h urban estimate
          const title = toPickup ? 'Driver en route to you' : 'On the way to destination';
          const body = toPickup
            ? `About ${minutes} min · ${km.toFixed(1)} km to pickup`
            : `About ${minutes} min · ${km.toFixed(1)} km to destination`;
          await notifyUser(
            ride.rider_id,
            title,
            body,
            'live_tracking',
            {
              type: 'live_tracking',
              rideId: String(ride.id),
              status: ride.status,
              minutes: String(minutes),
              km: km.toFixed(1),
              phase: toPickup ? 'pickup' : 'destination'
            },
            { skipDb: true } // avoid flooding notification inbox
          );
        }
      }
    }
  } catch (e) {
    console.warn('[live-track push]', e.message);
  }

  return { lat, lng };
}

async function earnings(id,from,to){
 const rows=await db.query(`SELECT DATE(completed_at) day,COUNT(*) rides,SUM(GREATEST(0,final_fare-discount+tip)) gross,SUM(GREATEST(0,final_fare-discount+tip))*? driver_share FROM rides WHERE driver_id=? AND status='completed' AND completed_at>=COALESCE(?,DATE_SUB(UTC_DATE(),INTERVAL 30 DAY)) AND completed_at<COALESCE(?,DATE_ADD(UTC_DATE(),INTERVAL 1 DAY)) GROUP BY DATE(completed_at) ORDER BY day DESC`,[(1-config.ride.driverCommission/100),id,from||null,to||null]);
 const total=rows.reduce((s,r)=>s+Number(r.driver_share||0),0); return {total:Number(total.toFixed(2)),days:rows};
}
async function payout(id,b){
 const amount=Number(b.amount); if(!amount||amount<=0)throw ApiError.badRequest('Invalid payout amount.');
 const p=await db.query('SELECT total_earnings FROM driver_profiles WHERE user_id=?',[id]); if(!p.length)throw ApiError.notFound('Driver not found.');
 const paid=await db.query(`SELECT COALESCE(SUM(amount),0) total FROM payout_requests WHERE driver_id=? AND status IN ('pending','approved','paid')`,[id]);
 const available=Number(p[0].total_earnings)-Number(paid[0].total); if(amount>available)throw ApiError.badRequest('Requested payout exceeds available earnings.');
 const r=await db.query('INSERT INTO payout_requests(driver_id,amount,method,account_details) VALUES(?,?,?,?)',[id,amount,b.method,JSON.stringify(b.accountDetails||{})]); return {id:r.insertId,status:'pending'};
}


async function ensureChangeRequestsTable() {
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS driver_change_requests (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      driver_id BIGINT NOT NULL,
      request_type VARCHAR(32) NOT NULL,
      field_name VARCHAR(64) NOT NULL,
      new_value TEXT,
      reason TEXT,
      status VARCHAR(32) DEFAULT 'pending',
      rejection_reason TEXT,
      meta JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX (driver_id), INDEX (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  } catch (e) { console.warn('[ensureChangeRequestsTable]', e.message); }
}

async function applicationStatus(driverId){
  const id = Number(driverId);
  if(!id) throw ApiError.badRequest('Invalid driver id');
  const rows = await db.query(
    `SELECT u.id, u.status AS user_status, dp.application_status, dp.rejection_reason, dp.rating, dp.total_rides
     FROM users u LEFT JOIN driver_profiles dp ON dp.user_id=u.id
     WHERE u.id=? AND u.role='driver' LIMIT 1`, [id]
  );
  if(!rows.length) throw ApiError.notFound('Application not found');
  const r = rows[0];
  return {
    driverId: r.id,
    applicationStatus: r.application_status || 'Pending',
    userStatus: r.user_status,
    rejectionReason: r.rejection_reason || null,
    rating: r.rating != null ? Number(r.rating) : null,
  };
}

async function reviews(driverId){
  try {
    const rows = await db.query(
      `SELECT rt.id, rt.stars AS rating, rt.feedback AS comment, rt.created_at,
              COALESCE(u.full_name, 'Rider') AS rider_name,
              u.photo_url AS rider_photo
       FROM ratings rt
       JOIN rides r ON r.id = rt.ride_id
       LEFT JOIN users u ON u.id = rt.from_user_id
       WHERE rt.to_user_id=? OR r.driver_id=?
       ORDER BY rt.created_at DESC LIMIT 50`, [driverId, driverId]
    );
    return rows.map(x => ({
      id: x.id,
      rating: Number(x.rating),
      comment: x.comment || null,
      createdAt: x.created_at,
      riderName: x.rider_name,
      riderPhoto: x.rider_photo || null,
    }));
  } catch (e) {
    console.warn('[reviews]', e.message);
    return [];
  }
}

async function requestProfileChange(driverId, body){
  await ensureChangeRequestsTable();
  const field = String(body.field || '').trim();
  const newValue = String(body.newValue || '').trim();
  const reason = String(body.reason || '').trim();
  if(!field || !newValue) throw ApiError.badRequest('field and newValue are required');
  const allowed = ['full_name','phone','email','home_address','national_id'];
  if(!allowed.includes(field)) throw ApiError.badRequest('Unsupported field');
  try {
    const r = await db.query(
      `INSERT INTO driver_change_requests(driver_id, request_type, field_name, new_value, reason, status)
       VALUES(?,?,?,?,?,'pending')`,
      [driverId, 'profile', field, newValue, reason || null]
    );
    return { id: r.insertId, status: 'pending' };
  } catch (e) {
    if (String(e.message||'').includes("doesn't exist")) {
      throw ApiError.badRequest('Change requests table not ready. Contact support.');
    }
    throw e;
  }
}

async function requestDocumentUpdate(driverId, body, files){
  await ensureChangeRequestsTable();
  const docType = String(body.documentType || body.type || '').trim();
  const reason = String(body.reason || '').trim();
  if(!docType) throw ApiError.badRequest('documentType is required');
  let url = null, publicId = null, resourceType = 'image';
  if(files && files.document && files.document[0]){
    const up = await upload(files.document[0], `drivers/${driverId}/docs`);
    url = up.url; publicId = up.public_id; resourceType = up.resource_type || 'image';
  }
  const expiresAt = body.expiresAt || body.expirationDate || null;
  const r = await db.query(
    `INSERT INTO driver_change_requests(driver_id, request_type, field_name, new_value, reason, status, meta)
     VALUES(?,?,?,?,?,'pending',?)`,
    [driverId, 'document', docType, url || '', reason || null, JSON.stringify({ publicId, resourceType, expiresAt })]
  );
  return { id: r.insertId, status: 'pending' };
}

async function requestVehicleChange(driverId, body){
  await ensureChangeRequestsTable();
  const reason = String(body.reason || '').trim();
  const payload = {
    vehicleType: body.vehicleType || null,
    plateNumber: body.plateNumber || null,
    vehicleMake: body.vehicleMake || null,
    vehicleModel: body.vehicleModel || null,
    vehicleColor: body.vehicleColor || null,
    modelYear: body.modelYear || null,
  };
  if(!Object.values(payload).some(Boolean)) throw ApiError.badRequest('Provide at least one vehicle field');
  const r = await db.query(
    `INSERT INTO driver_change_requests(driver_id, request_type, field_name, new_value, reason, status)
     VALUES(?,?,?,?,?,'pending')`,
    [driverId, 'vehicle', 'vehicle_details', JSON.stringify(payload), reason || null]
  );
  return { id: r.insertId, status: 'pending' };
}

async function listChangeRequests(driverId){
  await ensureChangeRequestsTable();
  try {
    return await db.query(
      `SELECT id, request_type, field_name, new_value, reason, status, rejection_reason, created_at, updated_at
       FROM driver_change_requests WHERE driver_id=? ORDER BY id DESC LIMIT 50`, [driverId]
    );
  } catch (_) { return []; }
}

async function updateProfilePhoto(driverId, file){
  if(!file) throw ApiError.badRequest('Photo file is required');
  const up = await upload(file, `drivers/${driverId}/photo`);
  // photo_url lives on users (driver_profiles has no photo_url column)
  await db.query('UPDATE users SET photo_url=? WHERE id=?', [up.url, driverId]);
  return { photoUrl: up.url, photo_url: up.url };
}

async function removeProfilePhoto(driverId){
  await db.query('UPDATE users SET photo_url=NULL WHERE id=?', [driverId]);
  return { photoUrl: null, photo_url: null };
}


/**
 * Exchange driverId + email for a session when the application is approved/active
 * (or still pending — allows finishing onboarding without a second OTP).
 */
async function bootstrapSession({ driverId, email }) {
  const id = Number(driverId);
  const mail = String(email || '').trim().toLowerCase();
  if (!id || !mail) throw ApiError.badRequest('driverId and email are required');
  const rows = await db.query(
    `SELECT u.id,u.full_name,u.phone,u.email,u.photo_url,u.status,u.role,d.application_status,d.driver_code,d.online,d.rating
     FROM users u JOIN driver_profiles d ON d.user_id=u.id
     WHERE u.id=? AND u.role='driver' AND LOWER(u.email)=? LIMIT 1`,
    [id, mail]
  );
  if (!rows.length) throw ApiError.unauthorized('Driver not found for this email');
  const u = rows[0];
  if (u.status === 'suspended' || u.status === 'rejected') {
    throw ApiError.forbidden('This account is suspended or rejected.');
  }
  // Mark user active if application approved so refresh tokens work
  const appStatus = String(u.application_status || '').toLowerCase();
  if ((appStatus === 'approved' || appStatus === 'active') && u.status !== 'active') {
    await db.query(`UPDATE users SET status='active' WHERE id=?`, [id]);
    u.status = 'active';
  }
  if (appStatus === 'approved') {
    await db.query(`UPDATE driver_profiles SET application_status='active' WHERE user_id=?`, [id]).catch(() => {});
    u.application_status = 'active';
  }
  const accessToken = signAccess({ sub: u.id, role: 'driver' });
  const refreshToken = await issueRefreshToken(u.id, 'driver');
  return {
    accessToken,
    refreshToken,
    user: {
      id: u.id,
      role: 'driver',
      fullName: u.full_name,
      full_name: u.full_name,
      phone: u.phone,
      email: u.email,
      photoUrl: u.photo_url,
      photo_url: u.photo_url,
      status: u.status,
      application_status: u.application_status,
      applicationStatus: u.application_status,
      driver_code: u.driver_code,
      online: !!u.online,
      rating: u.rating != null ? Number(u.rating) : null,
    },
    driverId: u.id,
    applicationStatus: u.application_status,
  };
}

module.exports={register,profile,documents,setOnline,location,earnings,payout,applicationStatus,reviews,requestProfileChange,requestDocumentUpdate,requestVehicleChange,listChangeRequests,updateProfilePhoto,removeProfilePhoto,bootstrapSession};

