const { validationResult } = require('express-validator');
const ApiError = require('./ApiError');
function validate(req,_res,next){
  const errors = validationResult(req);
  if (!errors.isEmpty()) return next(ApiError.badRequest('Validation failed', errors.array()));
  next();
}
module.exports = { validate };
