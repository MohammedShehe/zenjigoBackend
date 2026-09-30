const multer=require('multer');
const config=require('../config/env');
const ApiError=require('../utils/ApiError');
const storage=multer.memoryStorage();
const allowed=new Set(['image/jpeg','image/png','image/webp','application/pdf']);
const upload=multer({storage,limits:{fileSize:config.security.maxUploadMb*1024*1024},fileFilter:(_r,f,cb)=>allowed.has(f.mimetype)?cb(null,true):cb(ApiError.badRequest('Only JPG, PNG, WEBP and PDF files are allowed.'))});
module.exports={upload};
