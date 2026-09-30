const service=require('../services/ride.service'); const {ok}=require('../utils/response'); const asyncHandler=require('../utils/asyncHandler'); const db=require('../config/db'); const ApiError=require('../utils/ApiError');
exports.quote=asyncHandler(async(req,res)=>ok(res,await service.quote(req.body)));
exports.create=asyncHandler(async(req,res)=>ok(res,await service.create(req.user.sub,req.body),'Ride requested',201));
exports.list=asyncHandler(async(req,res)=>ok(res,await service.listForUser(req.user.sub,req.user.role,req.query.limit)));
exports.get=asyncHandler(async(req,res)=>ok(res,await service.getById(req.params.id,req.user.sub)));
exports.cancel=asyncHandler(async(req,res)=>ok(res,await service.cancelRider(req.user.sub,req.params.id,req.body.reason),'Ride cancelled'));
exports.rate=asyncHandler(async(req,res)=>ok(res,await service.rate(req.user.sub,req.params.id,req.body.stars,req.body.feedback,req.body.tip),'Ride rated'));
exports.track=asyncHandler(async(req,res)=>{
 const r=await service.getById(req.params.id,req.user.sub); if(!r.driver_id)return ok(res,{ride:r,location:null});
 const rows=await db.query('SELECT lat,lng,heading,speed,recorded_at FROM driver_locations WHERE driver_id=? AND (ride_id=? OR ride_id IS NULL) ORDER BY id DESC LIMIT 1',[r.driver_id,req.params.id]);
 ok(res,{ride:r,location:rows[0]||null});
});
