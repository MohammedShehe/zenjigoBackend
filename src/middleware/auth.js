const {verifyAccess}=require('../utils/jwt');
const ApiError=require('../utils/ApiError');
function auth(req,_res,next){
  try {
    const h=req.headers.authorization||'';
    if(!h.startsWith('Bearer ')) throw ApiError.unauthorized('Access token required');
    req.user=verifyAccess(h.slice(7));
    next();
  } catch(e){ next(e.isOperational?e:ApiError.unauthorized('Invalid or expired access token')); }
}
function roles(...allowed){return (req,_res,next)=>allowed.includes(req.user?.role)?next():next(ApiError.forbidden('You do not have permission for this resource.'))}
module.exports={auth,roles};
