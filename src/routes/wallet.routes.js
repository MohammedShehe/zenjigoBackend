const router = require('express').Router();
const c = require('../controllers/wallet.controller');

router.get('/', c.balance);
router.get('/transactions', c.transactions);
router.post('/topup', c.topup);
router.get('/topup/:id', c.topupStatus);
router.post('/topup/:id/cancel', c.topupCancel);
router.post('/charge', c.charge);

module.exports = router;
