const {Server}=require('socket.io'); const {verifyAccess}=require('../utils/jwt'); const db=require('../config/db'); const driver=require('../services/driver.service'); const chat=require('../services/chat.service'); const config=require('../config/env');
function init(http){
 const io=new Server(http,{cors:{origin:config.corsOrigins,credentials:true}});
 io.use((socket,next)=>{try{const token=socket.handshake.auth?.token||socket.handshake.headers.authorization?.replace('Bearer ','');socket.user=verifyAccess(token);next();}catch(e){next(new Error('Unauthorized'));}});
 io.on('connection',socket=>{
  socket.join(`user:${socket.user.sub}`);
  socket.on('ride:join',async({rideId})=>{try{const r=await db.query('SELECT rider_id,driver_id FROM rides WHERE id=?',[rideId]);if(r.length&&[r[0].rider_id,r[0].driver_id].includes(socket.user.sub))socket.join(`ride:${rideId}`);}catch{}});
  socket.on('driver:location',async data=>{if(socket.user.role!=='driver')return;try{const x=await driver.location(socket.user.sub,data);if(data.rideId)io.to(`ride:${data.rideId}`).emit('ride:location',{driverId:socket.user.sub,...x,heading:data.heading,speed:data.speed});}catch(e){socket.emit('error',{message:e.message});}});
  socket.on('chat:join',async({conversationId})=>{const member=await db.query('SELECT 1 FROM conversation_members WHERE conversation_id=? AND user_id=?',[conversationId,socket.user.sub]);if(member.length)socket.join(`chat:${conversationId}`);});
  socket.on('chat:message',async({conversationId,text,replyToId})=>{try{const m=await chat.send(socket.user.sub,conversationId,text,replyToId);io.to(`chat:${conversationId}`).emit('chat:message',m);}catch(e){socket.emit('error',{message:e.message});}});
 });
 return io;
}
module.exports={init};
