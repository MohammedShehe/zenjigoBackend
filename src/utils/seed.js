require('../config/env');
const db=require('../config/db');
const {hashPassword}=require('./hash');
const config=require('../config/env');

(async()=>{
  await db.health();

  const email=(config.seedAdmin.email||'admin@zenjigo.example').trim().toLowerCase();
  const password=config.seedAdmin.password||'ChangeMe_StrongPassword_123!';
  const phone=config.seedAdmin.phone||'+255700000001';

  if(password.includes('ChangeMe_') && config.nodeEnv==='production'){
    throw new Error('Set a real SEED_ADMIN_PASSWORD before running the production seed.');
  }

  const hash=await hashPassword(password);
  const existing=await db.query('SELECT id FROM users WHERE email=? LIMIT 1',[email]);

  let adminId;
  if(existing.length){
    adminId=existing[0].id;
    await db.query(
      'UPDATE users SET role="admin",phone=?,password_hash=?,status="active" WHERE id=?',
      [phone,hash,adminId]
    );
    console.log('Updated seed admin.');
  }else{
    const r=await db.query(
      'INSERT INTO users(role,full_name,phone,email,password_hash,status,email_verified_at) VALUES("admin","ZenjiGO Administrator",?,?,?,"active",UTC_TIMESTAMP())',
      [phone,email,hash]
    );
    adminId=r.insertId;
    console.log('Created seed admin.');
  }

  await db.query(`
    INSERT INTO app_settings(setting_key,setting_value,updated_by) VALUES
    ('driver_commission',JSON_OBJECT('thresholdTzs',60000,'commissionPercent',20,'driverPercent',80),?),
    ('rider_cancellation',JSON_OBJECT('nearPickupKm',1,'percent',20),?)
    ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_by=VALUES(updated_by)
  `,[adminId,adminId]);

  const tours=await db.query('SELECT id FROM tour_packages LIMIT 1');
  if(!tours.length){
    await db.query(
      'INSERT INTO tour_packages(name,description,duration_hours,base_price,max_tourists,pickup_notes,created_by) VALUES("Full-Day Island Tour","A customizable full-day Zanzibar island experience.",8,150000,4,"Confirm pickup point with the driver.",?)',
      [adminId]
    );
    await db.query(
      'INSERT INTO tour_packages(name,description,duration_hours,base_price,max_tourists,pickup_notes,created_by) VALUES("Nungwi Sunset Ride","Sunset trip with flexible pickup.",4,85000,4,"Pickup time should be confirmed before departure.",?)',
      [adminId]
    );
  }

  console.log(`Admin email: ${email}`);
  console.log(`Admin phone: ${phone}`);
  console.log('Admin password: value from SEED_ADMIN_PASSWORD in .env');

  await db.pool.end();
})().catch(e=>{
  console.error(e);
  process.exit(1);
});
