const s=require('../services/chat.service'); const {ok}=require('../utils/response'); const asyncHandler=require('../utils/asyncHandler'); const ApiError=require('../utils/ApiError');
exports.list=asyncHandler(async(req,res)=>ok(res,await s.list(req.user.sub)));
exports.support=asyncHandler(async(req,res)=>ok(res,{conversationId:await s.createSupport(req.user.sub)},'Support chat ready'));
exports.ride=asyncHandler(async(req,res)=>ok(res,{conversationId:await s.ensureRideConversation(req.user.sub,req.params.rideId)}));
exports.messages=asyncHandler(async(req,res)=>ok(res,await s.messages(req.user.sub,req.params.id)));
exports.send=asyncHandler(async(req,res)=>{if(!req.body.text?.trim())throw ApiError.badRequest('Message text is required');ok(res,await s.send(req.user.sub,req.params.id,req.body.text.trim(),req.body.replyToId),'Message sent',201);});
exports.delete=asyncHandler(async(req,res)=>{await require('../config/db').query('UPDATE messages SET is_deleted=1,text="[deleted]" WHERE id=? AND sender_id=?',[req.params.messageId,req.user.sub]);ok(res,null,'Message deleted');});
