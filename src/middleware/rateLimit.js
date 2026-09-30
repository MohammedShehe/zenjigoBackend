const rateLimit=require('express-rate-limit');
const config=require('../config/env');
const globalLimiter=rateLimit({windowMs:config.security.rateWindowMs,max:config.security.rateMax,standardHeaders:true,legacyHeaders:false,message:{success:false,message:'Too many requests. Please try again later.'}});
const otpLimiter=rateLimit({windowMs:15*60*1000,max:10,standardHeaders:true,legacyHeaders:false});
module.exports={globalLimiter,otpLimiter};
