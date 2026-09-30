const router=require('express').Router();
const db=require('../config/db');
const {completeWalletTopup,verifySignature}=require('../services/payment.service');
router.post('/webhook',async(req,res)=>{
 try{
  const sig=req.get('x-zenjigo-signature');
  if(!verifySignature(JSON.stringify(req.body),sig)) return res.status(401).json({success:false,message:'Invalid webhook signature'});
  const {paymentId,externalReference,provider}=req.body;
  const p=await completeWalletTopup(paymentId,externalReference,provider);
  return res.json({success:true,data:{paymentId:p.id,status:'success'}});
 }catch(e){return res.status(e.statusCode||500).json({success:false,message:e.message});}
});
module.exports=router;
