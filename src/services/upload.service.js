const cloudinary=require('../config/cloudinary'); const ApiError=require('../utils/ApiError');
function uploadBuffer(buffer,folder,resourceType='auto'){
 return new Promise((resolve,reject)=>{
  const stream=cloudinary.uploader.upload_stream({folder,resource_type:resourceType},(err,result)=>err?reject(err):resolve(result));
  stream.end(buffer);
 });
}
async function upload(file,folder){
 if(!file) throw ApiError.badRequest('File is required');
 const resourceType=file.mimetype==='application/pdf'?'raw':'image';
 const r=await uploadBuffer(file.buffer,folder,resourceType);
 return {publicId:r.public_id,url:r.secure_url,resourceType:r.resource_type};
}
module.exports={upload};
