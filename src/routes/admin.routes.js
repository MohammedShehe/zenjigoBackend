const router=require('express').Router(); const c=require('../controllers/admin.controller'); const {body}=require('express-validator'); const {validate}=require('../utils/validation');
router.get('/dashboard',c.dashboard); router.get('/riders',c.riders); router.get('/drivers',c.drivers); router.get('/drivers/:id',c.driver); router.patch('/drivers/:id/status',[body('status').isIn(['under_review','approved','active','rejected'])],validate,c.driverStatus); router.patch('/documents/:id/status',[body('status').isIn(['approved','rejected','pending'])],validate,c.documentStatus);
router.get('/rides',c.rides); router.get('/rides/:id',c.ride);
router.get('/promos',c.promos); router.post('/promos',c.createPromo);
router.get('/payments',c.payments); router.post('/payments/:id/complete',c.completePayment);
router.get('/payouts',c.payouts); router.patch('/payouts/:id/status',[body('status').isIn(['approved','paid','rejected'])],validate,c.payoutStatus);
router.post('/notifications',c.sendNotification); router.get('/tour-packages',c.tours); router.post('/tour-packages',c.createTour); router.get('/audit-logs',c.audit);
module.exports=router;
