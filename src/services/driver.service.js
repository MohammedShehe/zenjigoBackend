const db=require('../config/db'); const ApiError=require('../utils/ApiError'); const {normalizePhone}=require('../utils/phone'); const {upload}=require('./upload.service'); const {hashPassword}=require('../utils/hash'); const {publicUser}=require('./auth.service'); const config=require('../config/env'); const otp=require('./otp.service');
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
 if(data.emailOtpCode) await otp.verify({target:emailTarget,code:data.emailOtpCode,purpose:'driver_registration'});
 else throw ApiError.badRequest('emailOtpCode is required for driver registration.');
 if(!data.fullName||!data.email||!data.nationalId)throw ApiError.badRequest('fullName, phone, email and nationalId are required.');
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
     uploaded.push({ type: docType, publicId: u.publicId, url: u.url, resourceType: u.resourceType });
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
       'INSERT INTO driver_documents(driver_id,document_type,public_id,url,resource_type,status) VALUES(?,?,?,?,?,"pending")',
       [id, u.type, u.publicId, u.url, u.resourceType]
     );
   }
   return id;
 });

 return {
   driverId: result,
   driverCode: code(result),
   documents: uploaded.map(u => ({ type: u.type, url: u.url })),
   status: 'pending',
   applicationStatus: 'pending'
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
async function location(id,b){
 const r=await db.query('UPDATE driver_profiles SET current_lat=?,current_lng=?,location_updated_at=UTC_TIMESTAMP() WHERE user_id=?',[b.lat,b.lng,id]);
 if(!r.affectedRows)throw ApiError.notFound('Driver not found');
 await db.query('INSERT INTO driver_locations(driver_id,ride_id,lat,lng,heading,speed) VALUES(?,?,?,?,?,?)',[id,b.rideId||null,b.lat,b.lng,b.heading??null,b.speed??null]);
 return {lat:b.lat,lng:b.lng};
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
module.exports={register,profile,documents,setOnline,location,earnings,payout};
