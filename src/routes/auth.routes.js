const router = require('express').Router();
const { body } = require('express-validator');
const { validate } = require('../utils/validation');
const c = require('../controllers/auth.controller');
const { otpLimiter } = require('../middleware/rateLimit');

router.post('/rider/send-otp', otpLimiter, [
  body('phone').isString().notEmpty(),
  body('email').isEmail().withMessage('A valid email is required for OTP delivery')
], validate, (req, res, next) => {
  req.body.role = 'rider';
  req.body.purpose = req.body.purpose || 'login';
  return c.sendOtp(req, res, next);
});

router.post('/rider/verify-otp', [
  body('phone').notEmpty(), body('email').isEmail(),
  body('code').isLength({ min: 4, max: 8 }), body('fullName').optional().isLength({ max: 120 })
], validate, c.verifyRider);

router.post('/driver/send-otp', otpLimiter, [
  body('phone').optional().isString(),
  body('email').isEmail().withMessage('A valid email is required for OTP delivery'),
  body('purpose').optional().isIn(['login', 'driver_registration'])
], validate, (req, res, next) => {
  req.body.role = 'driver';
  req.body.purpose = req.body.purpose || 'login';
  return c.sendOtp(req, res, next);
});

router.post('/driver/send-email-otp', otpLimiter, [
  body('email').isEmail(), body('purpose').optional().isIn(['driver_registration'])
], validate, (req, res, next) => { req.body.purpose = req.body.purpose || 'driver_registration'; c.sendEmailOtp(req, res, next); });

router.post('/driver/verify-otp', [
  body('target').isEmail(), body('code').isLength({ min: 4, max: 8 }),
  body('purpose').optional().isIn(['login', 'driver_registration'])
], validate, (req, res, next) => { req.body.purpose = req.body.purpose || 'driver_registration'; c.verifyDriverOtp(req, res, next); });

router.post('/driver/login', [
  body('phone').notEmpty(), body('email').optional().isEmail(), body('code').notEmpty()
], validate, c.loginDriver);

router.post('/admin/login', [body('email').isEmail(), body('password').isString().isLength({ min: 8 })], validate, c.adminLogin);
router.post('/admin/verify-otp', [body('email').isEmail(), body('code').isLength({ min: 4, max: 8 })], validate, c.adminVerifyOtp);
router.post('/refresh', [body('refreshToken').notEmpty()], validate, c.refresh);
router.post('/logout', c.logout);

module.exports = router;
