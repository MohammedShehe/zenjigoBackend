const router = require('express').Router();
const c = require('../controllers/driver.controller');
const { upload } = require('../middleware/upload');
const { body } = require('express-validator');
const { validate } = require('../utils/validation');

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

router.get('/application-status/:driverId', c.applicationStatus);

const places = require('../controllers/places.controller');
router.get('/places/autocomplete', places.placesAutocomplete);
router.get('/places/details', places.placeDetails);

router.post('/bootstrap-session', c.bootstrapSession);

module.exports = router;



