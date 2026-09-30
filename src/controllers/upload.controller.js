const {upload}=require('../services/upload.service'); const {ok}=require('../utils/response'); const asyncHandler=require('../utils/asyncHandler'); const config=require('../config/env');
exports.single=asyncHandler(async(req,res)=>ok(res,await upload(req.file,`${config.cloudinary.folder}/${req.user.role}`),'File uploaded',201));
