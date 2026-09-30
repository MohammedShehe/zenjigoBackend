const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const config = require('../config/env');
const payment = require('./payment.provider');

const THRESHOLD = Number(process.env.DRIVER_SETTLEMENT_THRESHOLD_TZS || 60000);
const RATE = Number(process.env.DRIVER_COMMISSION_PERCENT || 20);
const NEAR_RADIUS = Number(process.env.CANCEL_NEAR_PICKUP_KM || 1);
const CANCEL_PERCENT = Number(process.env.CANCEL_NEAR_PICKUP_PERCENT || 20);

function haversine(a,b,c,d){
  const R=6371,rad=Math.PI/180;
  const dLat=(c-a)*rad,dLon=(d-b)*rad;
  const x=Math.sin(dLat/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}

async function ensure(conn,driverId){
  await conn.query(`INSERT INTO driver_financials(driver_id) VALUES(?) ON DUPLICATE KEY UPDATE driver_id=VALUES(driver_id)`,[driverId]);
}

async function state(driverId,conn=db){
  await ensure(conn,driverId);
  const rows=await conn.query('SELECT * FROM driver_financials WHERE driver_id=?',[driverId]);
  return rows[0];
}

async function getStatus(driverId,conn=db){
  const f=await state(driverId,conn);
  const gross=Number(f.gross_since_settlement||0);
  const owed=Number(f.commission_owed||0);
  return {
    driverId:Number(driverId),
    grossSinceSettlement:gross,
    commissionOwed:owed,
    lifetimeGross:Number(f.lifetime_gross||0),
    lifetimeCommission:Number(f.lifetime_commission||0),
    blocked:Boolean(Number(f.blocked)===1 || gross>=THRESHOLD),
    autopayEnabled:Boolean(Number(f.autopay_enabled)===1),
    autopayProvider:f.autopay_provider||null,
    threshold:THRESHOLD,
    commissionRate:RATE,
    thresholdRemaining:Math.max(0,THRESHOLD-gross),
    settlementRequired:(gross>=THRESHOLD || owed>0)
  };
}

async function isBlocked(driverId){ return (await getStatus(driverId)).blocked; }

async function assertUsable(driverId,action='use the driver app'){
  const s=await getStatus(driverId);
  if(s.blocked || s.commissionOwed>0){
    throw ApiError.forbidden(`ZenjiGO settlement required. Outstanding commission: TZS ${s.commissionOwed.toLocaleString()}. Settle the balance before you can ${action}.`);
  }
  return s;
}

async function recordRideEarning(conn,driverId,grossFare,rideId){
  const gross=Math.max(0,Number(grossFare||0));
  const commission=Math.round(gross*RATE)/100;
  const driverShare=Math.max(0,gross-commission);
  await ensure(conn,driverId);

  if(rideId){
    const existing=await conn.query('SELECT id FROM driver_earning_ledger WHERE driver_id=? AND ride_id=? LIMIT 1',[driverId,rideId]);
    if(existing.length) return getStatus(driverId,conn);
  }

  await conn.query(`INSERT INTO driver_earning_ledger(driver_id,ride_id,gross_amount,commission_rate,commission_amount,driver_amount) VALUES(?,?,?,?,?,?)`,
    [driverId,rideId||null,gross,RATE,commission,driverShare]);
  await conn.query(`UPDATE driver_financials
    SET gross_since_settlement=gross_since_settlement+?,
        lifetime_gross=lifetime_gross+?, lifetime_commission=lifetime_commission+?,
        blocked=IF(gross_since_settlement+?>=?,1,blocked)
    WHERE driver_id=?`,[gross,gross,commission,gross,THRESHOLD,driverId]);
  const updated=(await conn.query('SELECT gross_since_settlement,commission_owed FROM driver_financials WHERE driver_id=? FOR UPDATE',[driverId]))[0];
  const cycles=Math.floor(Number(updated.gross_since_settlement)/THRESHOLD);
  const due=cycles*THRESHOLD*RATE/100;
  await conn.query('UPDATE driver_financials SET commission_owed=?,blocked=? WHERE driver_id=?',[due,cycles>0?1:0,driverId]);
  await conn.query(`UPDATE driver_profiles SET total_earnings=total_earnings+?,total_rides=total_rides+1 WHERE user_id=?`,[driverShare,driverId]);
  const s=await getStatus(driverId,conn);
  if(s.blocked) await conn.query('UPDATE driver_profiles SET online=0 WHERE user_id=?',[driverId]);
  return {...s,gross,commission,driverShare};
}

async function createSettlement(driverId,provider='example',metadata={}){
  return db.transaction(async conn=>{
    const s=await getStatus(driverId,conn);
    if(s.commissionOwed<=0) return {status:'already_settled',amount:0};
    const existing=await conn.query(`SELECT id,status FROM driver_settlements WHERE driver_id=? AND status IN ('pending','processing') ORDER BY id DESC LIMIT 1`,[driverId]);
    if(existing.length) return {id:existing[0].id,status:existing[0].status,amount:s.commissionOwed};
    const r=await conn.query(`INSERT INTO driver_settlements(driver_id,gross_earnings,commission_rate,commission_amount,status,provider,metadata) VALUES(?,?,?,?, 'pending',?,?,?)`,
      [driverId,s.grossSinceSettlement,RATE,s.commissionOwed,provider,JSON.stringify(metadata)]);
    return {id:r.insertId,status:'pending',amount:s.commissionOwed};
  });
}

async function markPaid(driverId,settlementId,externalReference){
  return db.transaction(async conn=>{
    const rows=await conn.query('SELECT * FROM driver_settlements WHERE id=? AND driver_id=? FOR UPDATE',[settlementId,driverId]);
    if(!rows.length) throw ApiError.notFound('Settlement not found.');
    const settlement=rows[0];
    if(settlement.status==='paid') return settlement;
    const f=await getStatus(driverId,conn);
    const paid=Math.min(Number(settlement.commission_amount),f.commissionOwed);
    const gross=Number(f.grossSinceSettlement);
    const cycles=Math.floor(gross/THRESHOLD);
    const remainingGross=Math.max(0,gross-cycles*THRESHOLD);
    const remainingCommission=Math.max(0,f.commissionOwed-paid);
    await conn.query(`UPDATE driver_settlements SET paid_amount=?,status='paid',external_reference=?,paid_at=UTC_TIMESTAMP() WHERE id=?`,[paid,externalReference||`MANUAL-${settlementId}`,settlementId]);
    await conn.query(`UPDATE driver_financials SET commission_owed=?,gross_since_settlement=?,blocked=? WHERE driver_id=?`,[remainingCommission,remainingGross,remainingCommission>0||remainingGross>=THRESHOLD?1:0,driverId]);
    if(remainingCommission<=0 && remainingGross<THRESHOLD) await conn.query('UPDATE driver_profiles SET online=0 WHERE user_id=?',[driverId]);
    return (await conn.query('SELECT * FROM driver_settlements WHERE id=?',[settlementId]))[0];
  });
}

async function settleNow(driverId,paymentMethodId=null,auto=false){
  const s=await getStatus(driverId);
  if(s.commissionOwed<=0) return {status:'already_settled',commission:s};
  const methods=paymentMethodId
    ? await db.query('SELECT * FROM driver_payment_methods WHERE id=? AND driver_id=? AND active=1',[paymentMethodId,driverId])
    : await db.query('SELECT * FROM driver_payment_methods WHERE driver_id=? AND active=1 AND is_autopay_default=1 ORDER BY id DESC LIMIT 1',[driverId]);
  if(!methods.length) throw ApiError.badRequest('Add a valid driver payment method before settling.');
  const method=methods[0];
  const providerResult=await payment.chargeDriverCommission({amount:s.commissionOwed,currency:config.ride.currency,driverId,paymentMethod:method});
  const settlement=await createSettlement(driverId,providerResult.provider||method.provider,{auto});
  const paid=await markPaid(driverId,settlement.id,providerResult.externalReference);
  return {status:'paid',settlement:paid,commission:await getStatus(driverId)};
}

async function configureAutopay(driverId,enabled,provider,providerToken,metadata={}){
  if(enabled && !providerToken) throw ApiError.badRequest('A provider token/mandate is required for autopay. Never store raw payment credentials.');
  await db.transaction(async conn=>{
    await conn.query(`INSERT INTO driver_financials(driver_id,autopay_enabled,autopay_provider,autopay_reference,autopay_metadata) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE autopay_enabled=VALUES(autopay_enabled),autopay_provider=VALUES(autopay_provider),autopay_reference=VALUES(autopay_reference),autopay_metadata=VALUES(autopay_metadata)`,
      [driverId,enabled?1:0,enabled?(provider||config.payment.provider):null,enabled?providerToken:null,enabled?JSON.stringify(metadata):null]);
    if(enabled){
      await conn.query('UPDATE driver_payment_methods SET is_autopay_default=0 WHERE driver_id=?',[driverId]);
      await conn.query(`INSERT INTO driver_payment_methods(driver_id,provider,method_type,account_label,masked_account,provider_token,is_autopay_default,active) VALUES(?,?,?,?,?,?,1,1)`,
        [driverId,provider||config.payment.provider,metadata.methodType||'momo',metadata.accountLabel||'Autopay method',metadata.maskedAccount||null,providerToken]);
    } else {
      await conn.query('UPDATE driver_payment_methods SET is_autopay_default=0 WHERE driver_id=?',[driverId]);
    }
  });
  return getStatus(driverId);
}

async function tryAutopay(driverId){
  const s=await getStatus(driverId);
  if(!s.autopayEnabled || s.commissionOwed<=0) return {status:'not_due'};
  try{
    const f=await state(driverId);
    const methodRows=await db.query('SELECT * FROM driver_payment_methods WHERE driver_id=? AND active=1 AND (provider_token=? OR provider_token=?) ORDER BY id DESC LIMIT 1',[driverId,f.autopay_reference,f.autopay_reference]);
    if(!methodRows.length) return {status:'pending',reason:'No matching autopay payment method'};
    return await settleNow(driverId,methodRows[0].id,true);
  }catch(error){ return {status:'failed',message:error.message}; }
}

async function addPaymentMethod(driverId,b){
  if(!b.provider || !b.providerToken || !b.methodType) throw ApiError.badRequest('provider, providerToken and methodType are required.');
  const r=await db.query(`INSERT INTO driver_payment_methods(driver_id,provider,method_type,account_label,masked_account,provider_token,is_autopay_default) VALUES(?,?,?,?,?,?,?)`,
    [driverId,b.provider,b.methodType,b.accountLabel||null,b.maskedAccount||null,b.providerToken,b.isAutopayDefault?1:0]);
  return (await db.query('SELECT id,driver_id,provider,method_type,account_label,masked_account,is_autopay_default,created_at FROM driver_payment_methods WHERE id=?',[r.insertId]))[0];
}

module.exports={THRESHOLD,RATE,NEAR_RADIUS,CANCEL_PERCENT,haversine,state,getStatus,isBlocked,assertUsable,recordRideEarning,createSettlement,markPaid,configureAutopay,addPaymentMethod,settleNow,tryAutopay};
