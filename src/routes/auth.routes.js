const router=require('express').Router(); const {body}=require('express-validator'); const {validate}=require('../utils/validation'); const c=require('../controllers/auth.controller'); const {otpLimiter}=require('../middleware/rateLimit');
router.post('/rider/send-otp',otpLimiter,[body('phone').isString().notEmpty(),body('channel').optional().isIn(['sms','whatsapp'])],validate,c.sendOtp);
router.post('/rider/verify-otp',[body('phone').notEmpty(),body('code').isLength({min:4,max:8}),body('fullName').optional().isLength({max:120})],validate,c.verifyRider);
router.post('/driver/send-otp',otpLimiter,[body('phone').notEmpty(),body('purpose').optional().isIn(['login','driver_registration'])],validate,(req,res,next)=>{req.body.purpose=req.body.purpose||'login';c.sendOtp(req,res,next)});
router.post('/driver/login',[body('phone').notEmpty(),body('code').notEmpty()],validate,c.loginDriver);
router.post('/admin/login',[body('email').isEmail(),body('password').isString().isLength({min:8})],validate,c.adminLogin);
router.post('/refresh',[body('refreshToken').notEmpty()],validate,c.refresh);
router.post('/logout',c.logout);
module.exports=router;
