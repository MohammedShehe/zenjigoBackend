const router = require('express').Router();
const c = require('../controllers/driver.controller');
const { upload } = require('../middleware/upload');
const { body } = require('express-validator');
const { validate } = require('../utils/validation');
const { auth, roles } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');

router.post(
  '/register',
  upload.fields([
    { name: 'license', maxCount: 1 },
    { name: 'nationalId', maxCount: 2 },
    { name: 'nationalIdFile', maxCount: 1 },
    { name: 'insurance', maxCount: 1 },
    { name: 'vehiclePhotos', maxCount: 5 },
    { name: 'driverPhoto', maxCount: 1 }
  ]),
  [
    body('fullName').notEmpty(),
    body('phone').notEmpty(),
    body('email').isEmail(),
    body('nationalId').notEmpty(),
    body('vehicleType').isIn(['boda', 'bajaji', 'taxi']),
    body('plateNumber').notEmpty(),
    body('emailOtpCode').notEmpty().withMessage('Email verification code is required')
  ],
  validate,
  c.register
);

// Authenticated + ownership-checked (driver: own record only; admin: any). Never public.
router.get('/application-status', auth, roles('driver', 'admin'), (req, _res, next) => { req.params.driverId = req.user.sub; next(); }, c.applicationStatus);
router.get('/application-status/:driverId', auth, roles('driver', 'admin'), c.applicationStatus);

const places = require('../controllers/places.controller');
router.get('/places/autocomplete', places.placesAutocomplete);
router.get('/places/details', places.placeDetails);

router.post('/bootstrap-session', authLimiter, [
  body('email').isEmail(),
  body('code').isString().isLength({ min: 4, max: 8 })
], validate, c.bootstrapSession);

module.exports = router;



