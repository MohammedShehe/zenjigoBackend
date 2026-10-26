const router = require('express').Router();
const c = require('../controllers/admin.controller');
const { body } = require('express-validator');
const { validate } = require('../utils/validation');

// Dashboard
router.get('/dashboard', c.dashboard);

// Current admin
router.get('/me', c.me);
router.patch('/me', c.updateMe);
router.post('/me/password', c.changeMyPassword);

// Riders
router.get('/riders', c.riders);
router.get('/riders/:id', c.rider);
router.post('/riders', c.createRider);
router.patch('/riders/:id', c.updateRider);
router.patch('/riders/:id/status', c.riderStatus);
router.delete('/riders/:id', c.deleteRider);

// Drivers
router.get('/drivers', c.drivers);
router.get('/drivers/:id', c.driver);
router.post('/drivers', c.createDriver);
router.patch('/drivers/:id', c.updateDriver);
router.patch('/drivers/:id/status', [
  body('status').isIn(['under_review', 'approved', 'active', 'rejected', 'suspended'])
], validate, c.driverStatus);
router.delete('/drivers/:id', c.deleteDriver);
router.patch('/documents/:id/status', [
  body('status').isIn(['approved', 'rejected', 'pending'])
], validate, c.documentStatus);
router.get('/documents', c.documents);
router.get('/change-requests', c.changeRequests);
router.patch('/change-requests/:id', [
  body('status').isIn(['approved', 'rejected'])
], validate, c.reviewChangeRequest);
router.post('/drivers/:id/settle', c.settleDriver);
router.get('/driver-finance', c.driverFinance);

// Admins / Sub-admins
router.get('/admins', c.admins);
router.post('/admins', c.createAdmin);
router.patch('/admins/:id', c.updateAdmin);
router.delete('/admins/:id', c.deleteAdmin);

// Rides
router.get('/rides', c.rides);
router.get('/rides/:id', c.ride);
router.get('/live-map', c.liveMap);
router.get('/maps-config', c.mapsConfig);

// Finance
router.get('/payments', c.payments);
router.post('/payments/:id/complete', c.completePayment);
router.get('/payouts', c.payouts);
router.patch('/payouts/:id/status', [
  body('status').isIn(['approved', 'paid', 'rejected'])
], validate, c.payoutStatus);
router.get('/commissions', c.commissions);
router.get('/commission-settings', c.commissionSettings);
router.patch('/commission-settings', c.updateCommissionSettings);
router.get('/fare-settings', c.fareSettings);
router.patch('/fare-settings', c.updateFareSettings);
router.get('/cancel-settings', c.cancelSettings);
router.patch('/cancel-settings', c.updateCancelSettings);
router.get('/settlements', c.settlements);
router.get('/wallet-transactions', c.walletTransactions);

// Promos
router.get('/promos', c.promos);
router.post('/promos', c.createPromo);
router.patch('/promos/:id', c.updatePromo);
router.delete('/promos/:id', c.deletePromo);

// Tours
router.get('/tour-packages', c.tours);
router.post('/tour-packages', c.createTour);
router.patch('/tour-packages/:id', c.updateTour);
router.delete('/tour-packages/:id', c.deleteTour);

// Parcels
router.get('/parcels', c.parcels);
router.get('/tour-bookings', c.tourBookings);
router.get('/ratings', c.ratings);

// Notifications
router.get('/notifications', c.notifications);
router.post('/notifications', c.sendNotification);
router.patch('/notifications/:id/read', c.markNotificationRead);
router.post('/notifications/mark-all-read', c.markAllNotificationsRead);

// Conversations / Support chat center
router.get('/conversations', c.conversations);
router.post('/conversations/mark-all-read', c.markAllSupportRead);
router.get('/conversations/:id/messages', c.conversationMessages);
router.post('/conversations/:id/messages', c.sendConversationMessage);
router.post('/conversations/:id/read', c.markConversationRead);

// Settings & Audit
router.get('/settings', c.settings);
router.patch('/settings/:key', c.updateSetting);
router.get('/audit-logs', c.audit);

// Archive
router.get('/archives', c.archives);
router.get('/archives/:id', c.archive);
router.post('/archives/:id/restore', c.restoreArchive);
router.delete('/archives/:id', c.permanentDeleteArchive);

router.get('/driver-reports', c.driverReports);
router.patch('/driver-reports/:id', c.updateDriverReport);
module.exports = router;
