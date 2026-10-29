const service=require('../services/ride.service'); const {ok}=require('../utils/response'); const asyncHandler=require('../utils/asyncHandler'); const db=require('../config/db'); const ApiError=require('../utils/ApiError');
exports.quote=asyncHandler(async(req,res)=>ok(res,await service.quote(req.body)));
exports.create=asyncHandler(async(req,res)=>ok(res,await service.create(req.user.sub,req.body),'Ride requested',201));
exports.list=asyncHandler(async(req,res)=>ok(res,await service.listForUser(req.user.sub,req.user.role,req.query.limit)));
exports.get=asyncHandler(async(req,res)=>ok(res,await service.getById(req.params.id,req.user.sub)));
exports.cancel=asyncHandler(async(req,res)=>ok(res,await service.cancelRider(req.user.sub,req.params.id,req.body.reason),'Ride cancelled'));
exports.pay=asyncHandler(async(req,res)=>{
 if(req.user.role!=='rider') throw ApiError.forbidden('Only the rider can pay for a ride.');
 ok(res,await service.payRide(req.user.sub,req.params.id,{method:req.body.method,phone:req.body.phone}),'Payment processed');
});
exports.cancelPreview=asyncHandler(async(req,res)=>ok(res,await service.cancelPreview(req.user.sub,req.params.id)));
exports.nearbyDrivers=asyncHandler(async(req,res)=>{
  const lat = req.query.lat, lng = req.query.lng, radius = req.query.radius || req.query.radiusKm || 5;
  ok(res, await service.nearbyDrivers(lat, lng, radius));
});
exports.rate=asyncHandler(async(req,res)=>ok(res,await service.rate(req.user.sub,req.params.id,req.body.stars,req.body.feedback,req.body.tip),'Ride rated'));
exports.track=asyncHandler(async(req,res)=>{
 const r=await service.getById(req.params.id,req.user.sub); if(!r.driver_id)return ok(res,{ride:r,location:null});
 // Live position comes from the driver's profile row (updated on every GPS tick);
 // the breadcrumb table is throttled and only supplies heading/speed.
 const rows=await db.query('SELECT lat,lng,heading,speed,recorded_at FROM driver_locations WHERE driver_id=? AND (ride_id=? OR ride_id IS NULL) ORDER BY id DESC LIMIT 1',[r.driver_id,req.params.id]);
 const crumb=rows[0]||null;
 const liveLat=r.driver_lat!=null?Number(r.driver_lat):(crumb?Number(crumb.lat):null);
 const liveLng=r.driver_lng!=null?Number(r.driver_lng):(crumb?Number(crumb.lng):null);
 const loc=(liveLat!=null&&liveLng!=null)?{lat:liveLat,lng:liveLng,heading:crumb?crumb.heading:null,speed:crumb?crumb.speed:null,recorded_at:crumb?crumb.recorded_at:null}:null;
 ok(res,{ride:r,location:loc,driverLat:liveLat,driverLng:liveLng,heading:crumb&&crumb.heading!=null?Number(crumb.heading):null,speed:crumb&&crumb.speed!=null?Number(crumb.speed):null,recordedAt:crumb?crumb.recorded_at:null});
});
