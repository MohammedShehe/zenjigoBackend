const auth=require('../services/auth.service');
const {rotateRefreshToken,revokeRefreshToken}=require('../utils/jwt');
const {ok}=require('../utils/response');
const asyncHandler=require('../utils/asyncHandler');
exports.sendOtp=asyncHandler(async(req,res)=>ok(res,await auth.sendOtp(req.body),'OTP sent'));
exports.verifyRider=asyncHandler(async(req,res)=>ok(res,await auth.verifyRider(req.body),'Rider authenticated'));
exports.loginDriver=asyncHandler(async(req,res)=>ok(res,await auth.loginDriver(req.body),'Driver authenticated'));
exports.adminLogin=asyncHandler(async(req,res)=>ok(res,await auth.loginAdmin(req.body),'Admin authenticated'));
exports.refresh=asyncHandler(async(req,res)=>{
  const data=await rotateRefreshToken(req.body.refreshToken||'');
  if(!data) return res.status(401).json({success:false,message:'Invalid refresh token'});
  ok(res,data,'Token refreshed');
});
exports.logout=asyncHandler(async(req,res)=>{await revokeRefreshToken(req.body.refreshToken||'');ok(res,null,'Logged out');});
