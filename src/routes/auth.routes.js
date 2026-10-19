const router = require('express').Router();
const { body } = require('express-validator');
const { validate } = require('../utils/validation');
const c = require('../controllers/auth.controller');
const { otpLimiter } = require('../middleware/rateLimit');

// Rider
router.post(
  '/rider/send-otp',
  otpLimiter,
  [body('phone').isString().notEmpty(), body('channel').optional().isIn(['sms', 'whatsapp'])],
  validate,
  c.sendOtp
);
router.post(
  '/rider/verify-otp',
  [body('phone').notEmpty(), body('code').isLength({ min: 4, max: 8 }), body('fullName').optional().isLength({ max: 120 })],
  validate,
  c.verifyRider
);

// Driver phone OTP (login + registration)
router.post(
  '/driver/send-otp',
  otpLimiter,
  [body('phone').notEmpty(), body('purpose').optional().isIn(['login', 'driver_registration'])],
  validate,
  (req, res, next) => {
    req.body.purpose = req.body.purpose || 'login';
    c.sendOtp(req, res, next);
  }
);

// Driver email OTP (registration)
router.post(
  '/driver/send-email-otp',
  otpLimiter,
  [body('email').isEmail(), body('purpose').optional().isIn(['driver_registration'])],
  validate,
  (req, res, next) => {
    req.body.purpose = req.body.purpose || 'driver_registration';
    c.sendEmailOtp(req, res, next);
  }
);

// Non-consuming OTP check (phone or email) used by registration UI
router.post(
  '/driver/verify-otp',
  [
    body('target').notEmpty(),
    body('code').isLength({ min: 4, max: 8 }),
    body('purpose').optional().isIn(['login', 'driver_registration'])
  ],
  validate,
  (req, res, next) => {
    req.body.purpose = req.body.purpose || 'driver_registration';
    c.verifyDriverOtp(req, res, next);
  }
);

router.post(
  '/driver/login',
  [body('phone').notEmpty(), body('code').notEmpty()],
  validate,
  c.loginDriver
);

// Admin
router.post(
  '/admin/login',
  [body('email').isEmail(), body('password').isString().isLength({ min: 8 })],
  validate,
  c.adminLogin
);
router.post(
  '/admin/verify-otp',
  [body('email').isEmail(), body('code').isLength({ min: 4, max: 8 })],
  validate,
  c.adminVerifyOtp
);

router.post('/refresh', [body('refreshToken').notEmpty()], validate, c.refresh);
router.post('/logout', c.logout);

module.exports = router;
