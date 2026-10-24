const router = require('express').Router();
const c = require('../controllers/extra.controller');

router.get('/parcels', c.parcels);
router.post('/parcels', c.createParcel);
router.get('/parcels/:id', c.parcel);

router.get('/tour-packages', c.tourPackages);
router.get('/tours', c.tours);
router.post('/tours', c.createTour);

router.get('/app-version', c.appVersion);

module.exports = router;
