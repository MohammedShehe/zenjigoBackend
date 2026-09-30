const settlement=require('../services/driver.settlement.service');
const asyncHandler=require('../utils/asyncHandler');
/**
 * Drivers may always open the settlement screen and nearby map.
 * Any money/ride-mutating operation is blocked while commission is outstanding.
 */
module.exports=asyncHandler(async(req,res,next)=>{
  await settlement.assertCanOperate(req.user.sub);
  next();
});
