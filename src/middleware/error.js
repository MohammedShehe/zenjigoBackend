const config=require('../config/env');
function notFound(req,res){res.status(404).json({success:false,message:`Route not found: ${req.method} ${req.originalUrl}`});}
function errorHandler(err,req,res,_next){
  console.error(err);
  const status=err.statusCode||500;
  const body={success:false,message:status===500&&config.nodeEnv==='production'?'Internal server error':err.message||'Internal server error'};
  if(err.details) body.details=err.details;
  if(config.nodeEnv!=='production' && err.stack) body.stack=err.stack;
  res.status(status).json(body);
}
module.exports={notFound,errorHandler};
