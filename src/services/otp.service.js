const twilio=require('twilio');
const config=require('../config/env');
const db=require('../config/db');
const ApiError=require('../utils/ApiError');

function client(){
  if(!config.twilio.accountSid || !config.twilio.authToken || !config.twilio.verifyServiceSid)
    throw ApiError.badRequest('Twilio OTP is not configured. Set TWILIO_* values in .env.');
  return twilio(config.twilio.accountSid,config.twilio.authToken);
}
async function send({target,purpose='login',channel=config.twilio.channel}){
  const recent=await db.query('SELECT id,last_sent_at FROM otp_verifications WHERE target=? AND purpose=? AND status="pending" ORDER BY id DESC LIMIT 1',[target,purpose]);
  if(recent.length && recent[0].last_sent_at && (Date.now()-new Date(recent[0].last_sent_at).getTime()) < config.security.otpResendSeconds*1000)
    throw ApiError.badRequest(`Please wait ${config.security.otpResendSeconds} seconds before requesting another OTP.`);
  const result=await client().verify.v2.services(config.twilio.verifyServiceSid).verifications.create({to:target,channel});
  await db.query('UPDATE otp_verifications SET status="cancelled" WHERE target=? AND purpose=? AND status="pending"',[target,purpose]);
  await db.query('INSERT INTO otp_verifications(target,channel,purpose,provider_sid,last_sent_at,expires_at) VALUES(?,?,?,?,UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 MINUTE))',[target,channel,purpose,result.sid]);
  return {sid:result.sid};
}
async function verify({target,code,purpose='login'}){
  const result=await client().verify.v2.services(config.twilio.verifyServiceSid).verificationChecks.create({to:target,code});
  if(result.status!=='approved') throw ApiError.badRequest('Invalid or expired OTP.');
  await db.query('UPDATE otp_verifications SET status="verified",verified_at=UTC_TIMESTAMP() WHERE target=? AND purpose=? AND status="pending" ORDER BY id DESC LIMIT 1',[target,purpose]);
  return true;
}
module.exports={send,verify};
