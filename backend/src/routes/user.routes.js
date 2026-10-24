const router = require('express').Router();
const c = require('../controllers/user.controller');

router.get('/me', c.me);
router.patch('/me', c.update);

router.get('/saved-locations', c.savedList);
router.post('/saved-locations', c.savedCreate);
router.delete('/saved-locations/:id', c.savedDelete);

router.get('/payment-methods', c.paymentMethods);
router.post('/payment-methods', c.paymentCreate);
router.patch('/payment-methods/:id/default', c.paymentDefault);
router.delete('/payment-methods/:id', c.paymentDelete);

// Device / push registration
router.post('/device-token', c.deviceToken);
router.delete('/device-token', c.removeDeviceToken);
router.post('/notifications/token', c.deviceToken);
router.delete('/notifications/token', c.removeDeviceToken);

// Driver reports from riders (visible to admin)
router.post('/reports', c.createReport);
router.get('/reports', c.listMyReports);

router.post('/email-change/send-otp', c.sendEmailChangeOtp);
router.post('/email-change/verify-otp', c.verifyEmailChangeOtp);

module.exports = router;

