const db=require('../config/db'); const ride=require('../services/ride.service'); const ApiError=require('../utils/ApiError'); const {ok}=require('../utils/response'); const asyncHandler=require('../utils/asyncHandler');
exports.balance=asyncHandler(async(req,res)=>{const r=await db.query('SELECT balance,currency FROM wallets WHERE user_id=?',[req.user.sub]);ok(res,r[0]||{balance:0,currency:'TZS'});});
exports.transactions=asyncHandler(async(req,res)=>ok(res,await db.query('SELECT id,type,amount,balance_before balanceBefore,balance_after balanceAfter,reference_type referenceType,reference_id referenceId,payment_method paymentMethod,status,description,created_at createdAt FROM wallet_transactions WHERE user_id=? ORDER BY id DESC LIMIT 100',[req.user.sub])));
exports.topup=asyncHandler(async(req,res)=>{
 const amount=Number(req.body.amount); if(!amount||amount<=0)throw ApiError.badRequest('Amount must be greater than zero.');
 // No payment gateway was specified by the project. This endpoint creates a pending transaction; a real gateway webhook should call /admin/payments/:id/complete.
 const r=await db.query('INSERT INTO payment_transactions(user_id,amount,provider,status,metadata) VALUES(?,?,?,"pending",?)',[req.user.sub,amount,req.body.provider||'manual',JSON.stringify({requestedBy:req.user.sub})]);
 ok(res,{paymentId:r.insertId,status:'pending',message:'Top-up created. Complete it through your configured payment provider.'},'Top-up initiated',201);
});
exports.charge=asyncHandler(async(req,res)=>ok(res,{balance:await ride.chargeWallet(req.user.sub,Number(req.body.amount),'adjustment',null,'Wallet debit')},'Wallet charged'));
